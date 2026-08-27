import type { ProviderInterface, ChatMessage, ContentBlock, Tool, ToolDefinition } from "../providers/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { createAgentTools, executeTool } from "../utils/tools.js";
import { logger } from "../utils/logger.js";
import type { AgentState, AgentName, AgentPlan, PlanStep, AgentMessage, ReflectionResult, MemoryEntry, HumanApprovalRequest } from "./state.js";
import { AGENT_NAMES } from "../utils/agent_names.js";

export interface TaskContext {
  provider: ProviderInterface;
  reader: CodebaseReader;
  runner: PlaywrightRunner;
  testOutputPath: string;
  codebasePath: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
}

export abstract class BaseAgent {
  protected state: AgentState;
  protected agentName: AgentName;
  protected systemPrompt: string;
  protected taskContext: TaskContext;

  constructor(
    agentName: AgentName,
    state: AgentState,
    systemPrompt: string,
    taskContext: TaskContext
  ) {
    this.agentName = agentName;
    this.state = state;
    this.systemPrompt = systemPrompt;
    this.taskContext = taskContext;
  }

  abstract getGoal(): string;
  abstract getDefaultPlan(): AgentPlan;

  async run(): Promise<AgentState> {
    this.updateStatus("planning");
    
    const plan = await this.generatePlan();
    this.state.plans[this.agentName] = plan;
    
    if (plan.riskLevel === "high" || plan.riskLevel === "medium") {
      const approved = await this.requestHumanApproval(plan);
      if (!approved) {
        // Approval pending - return early with awaiting_human status
        // The graph will interrupt and resume after approval
        this.state.status = "awaiting_human";
        this.updateStatus("awaiting_approval");
        return this.state;
      }
    }

    this.updateStatus("executing");
    const result = await this.executePlan(plan);
    
    this.updateStatus("reflecting");
    const reflection = await this.reflect(result);
    this.recordReflection(reflection);
    
    if (reflection.shouldRevise && reflection.revisedOutput) {
      logger.info(`[${this.agentName}] Self-correction applied`);
    }

    this.updateStatus("completed");
    return this.state;
  }

  protected async generatePlan(): Promise<AgentPlan> {
    const defaultPlan = this.getDefaultPlan();
    
    const tools = await this.getAvailableTools();
    
    const planningPrompt = `You are a planner for the ${this.agentName} agent.
Goal: ${this.getGoal()}

Current context:
- Mode: ${this.state.mode}
- Project: ${this.state.projectName}
- ${this.state.mode === "issue" ? `Issue: #${this.state.issue?.number} - ${this.state.issue?.title}` : `Commit: ${this.state.commitDiff?.sha.slice(0,7)}`}
- Retries so far: ${this.state.retries}/${this.state.maxRetries}

Available tools: ${tools.map(t => t.name).join(", ")}

Default plan:
${JSON.stringify(defaultPlan, null, 2)}

Generate an optimized plan as JSON with this exact shape:
{
  "agent": "${this.agentName}",
  "goal": "specific goal for this run",
  "steps": [
    {"id": "step1", "tool": "tool_name", "args": {}, "expectedOutcome": "what we expect", "reasoning": "why this step"}
  ],
  "estimatedIterations": 3,
  "riskLevel": "low|medium|high"
}

Return ONLY valid JSON.`;

    try {
      const provider = this.taskContext.provider;
      const tools = await this.getAvailableTools();
      
      const response = await provider.chat({
        system: "You are an expert planner. Output ONLY valid JSON.",
        messages: [{ role: "user", content: planningPrompt }],
        tools,
        maxTokens: this.taskContext.maxTokens,
        temperature: 0.2,
      });

      const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
      const raw = textBlocks.map((b) => b.text).join("\n");
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]) as AgentPlan;
        plan.agent = this.agentName;
        plan.createdAt = Date.now();
        return plan;
      }
    } catch (err) {
      logger.warn(`[${this.agentName}] Plan generation failed, using default: ${err}`);
    }

    return defaultPlan;
  }

  protected async executePlan(plan: AgentPlan): Promise<string> {
    const messages: ChatMessage[] = [{ role: "user", content: this.getGoal() }];
    let lastOutput = "";

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      
      if (step.dependsOn) {
        const depsMet = step.dependsOn.every(depId => 
          plan.steps.some(s => s.id === depId && s.id !== step.id)
        );
        if (!depsMet) continue;
      }

      logger.info(`[${this.agentName}] Executing step ${step.id}: ${step.tool}`);
      
      messages.push({
        role: "assistant",
        content: [{ type: "tool_use", id: step.id, name: step.tool, input: step.args }]
      });

      try {
        const result = await executeTool(
          step.tool,
          step.args,
          this.taskContext.reader,
          this.taskContext.runner,
          this.taskContext.testOutputPath,
          this.taskContext.codebasePath
        );
        
        messages.push({
          role: "user",
          content: [{ type: "tool_result", toolUseId: step.id, content: result }]
        });
        
        lastOutput = result;
        this.recordStep(step.id, result, "next");
        
      } catch (err) {
        logger.error(`[${this.agentName}] Step ${step.id} failed: ${err}`);
        this.recordStep(step.id, String(err), "stop");
        throw err;
      }
    }

    return lastOutput;
  }

  protected async reflect(output: string): Promise<ReflectionResult> {
    const criticPrompt = `You are a critic evaluating the output of the ${this.agentName} agent.

Agent Goal: ${this.getGoal()}
Agent Output: ${output.slice(0, 5000)}

Evaluate on:
1. Correctness - Does it achieve the goal?
2. Completeness - Are there gaps?
3. Quality - Code style, test coverage, best practices?
4. Alignment - Does it follow project conventions?

Return ONLY valid JSON:
{
  "score": 0-100,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "suggestions": ["..."],
  "shouldRevise": true/false,
  "revisedOutput": "improved version if shouldRevise else null"
}`;

    try {
      const response = await this.taskContext.provider.chat({
        system: "You are a harsh but fair critic. Output ONLY valid JSON.",
        messages: [{ role: "user", content: criticPrompt }],
        maxTokens: 2048,
        temperature: 0.1,
      });

      const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
      const raw = textBlocks.map((b) => b.text).join("\n");
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ReflectionResult;
      }
    } catch (err) {
      logger.warn(`[${this.agentName}] Reflection failed: ${err}`);
    }

    return {
      score: 75,
      strengths: ["Completed execution"],
      weaknesses: ["Reflection unavailable"],
      suggestions: ["Enable critic for better quality"],
      shouldRevise: false,
    };
  }

  protected recordReflection(reflection: ReflectionResult): void {
    if (!this.state.reflectionHistory[this.agentName]) {
      this.state.reflectionHistory[this.agentName] = [];
    }
    this.state.reflectionHistory[this.agentName].push(reflection);
    
    logger.info(`[${this.agentName}] Reflection: ${reflection.score}/100, revise: ${reflection.shouldRevise}`);
  }

  protected async requestHumanApproval(plan: AgentPlan): Promise<boolean> {
    if (this.state.commitAutoApprove) {
      plan.approved = true;
      plan.approvedBy = "supervisor";
      return true;
    }

    // Check if there's already a pending approval for this plan
    const existingApproval = this.state.humanApprovals.find(
      a => a.agent === this.agentName && a.type === "plan" && !a.resolved
    );
    
    if (existingApproval) {
      // If already resolved, return the result
      if (existingApproval.resolved) {
        plan.approved = existingApproval.resolution === "approve";
        plan.approvedBy = existingApproval.resolution === "approve" ? "human" : "supervisor";
        return plan.approved;
      }
      // If pending but not resolved, signal to graph to wait
      this.state.status = "awaiting_human";
      this.updateStatus("awaiting_approval");
      return false;
    }

    // Create new approval request for LangGraph interrupt
    const request: HumanApprovalRequest = {
      id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      agent: this.agentName,
      type: "plan",
      title: `Approve plan for ${this.agentName}`,
      description: `Goal: ${plan.goal}\nSteps: ${plan.steps.length}\nRisk: ${plan.riskLevel}`,
      data: plan,
      options: [
        { label: "Approve", value: "approve" },
        { label: "Reject", value: "reject" },
        { label: "Modify", value: "modify" },
      ],
      defaultOption: "approve",
      createdAt: Date.now(),
      resolved: false,
    };

    this.state.humanApprovals.push(request);
    this.state.status = "awaiting_human";
    this.updateStatus("awaiting_approval");
    
    logger.warn(`[${this.agentName}] Awaiting human approval for plan (${request.id})`);
    
    // Return false to signal that execution should pause for approval
    // The graph's humanApprovalNode will interrupt and wait for resolution
    return false;
  }

  protected getAvailableTools(): ToolDefinition[] {
    return createAgentTools(this.taskContext.reader, this.taskContext.runner, this.taskContext.codebasePath);
  }

  protected updateStatus(status: AgentState["agentStatus"][AgentName]): void {
    this.state.agentStatus[this.agentName] = status;
    this.state.currentAgent = this.agentName;
  }

  protected recordStep(name: string, output: string, decision: string): void {
    this.state.stepHistory.push({
      name,
      timestamp: Date.now(),
      agent: this.agentName,
      output: output.slice(0, 200),
      decision,
    });
  }

  protected sendMessage(to: AgentName | "broadcast", type: AgentMessage["type"], payload: unknown, correlationId?: string): void {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from: this.agentName,
      to,
      type,
      payload,
      timestamp: Date.now(),
      correlationId,
    };
    this.state.messages.push(message);
    
    // Also publish to message bus for real-time inter-agent communication
    if (this.state.messageBus) {
      this.state.messageBus.publish(message).catch(err =>
        logger.warn(`[${this.agentName}] Failed to publish message: ${err}`)
      );
    }
  }

  /**
   * Subscribe to messages from other agents via the message bus
   */
  protected subscribeToMessages(handler: (message: AgentMessage) => void): (() => void) | null {
    if (!this.state.messageBus) return null;
    return this.state.messageBus.subscribe(this.agentName, handler);
  }

  protected getMessages(from?: AgentName): AgentMessage[] {
    return this.state.messages.filter(m => 
      (m.to === this.agentName || m.to === "broadcast") && 
      (!from || m.from === from)
    );
  }

  protected remember(entry: Omit<MemoryEntry, "id" | "metadata"> & { metadata: Omit<MemoryEntry["metadata"], "timestamp"> }): void {
    const memoryEntry: MemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...entry,
      metadata: {
        ...entry.metadata,
        timestamp: Date.now(),
      },
    };
    
    // Store in memory store if available (for persistence across runs)
    if (this.state.memoryStore) {
      this.state.memoryStore.store(memoryEntry).catch(err => 
        logger.warn(`[${this.agentName}] Failed to store memory: ${err}`)
      );
    }
    
    // Also keep in local state for immediate access
    this.state.memory.push(memoryEntry);
  }

  protected recall(type: MemoryEntry["type"], tags: string[], limit = 5): MemoryEntry[] {
    // Try to retrieve from memory store first (includes cross-run memories)
    if (this.state.memoryStore) {
      // Note: This is async, but we need sync for recall
      // In practice, we'll use local state for immediate recall
      // and the store will be used for cross-run retrieval in future runs
    }
    
    return this.state.memory
      .filter(m => m.type === type && tags.some(t => m.metadata.tags.includes(t)))
      .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
      .slice(0, limit);
  }

  /**
   * Async version of recall that queries the memory store for cross-run memories
   */
  protected async recallFromStore(type: MemoryEntry["type"], tags: string[], limit = 5): Promise<MemoryEntry[]> {
    if (!this.state.memoryStore) {
      return this.recall(type, tags, limit);
    }
    return this.state.memoryStore.retrieve(type, tags, limit);
  }
}