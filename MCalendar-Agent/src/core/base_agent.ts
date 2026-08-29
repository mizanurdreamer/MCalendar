import type { ProviderInterface, ChatMessage, ContentBlock, Tool, ToolDefinition } from "../providers/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { createAgentTools, executeTool } from "../utils/tools.js";
import { logger } from "../utils/logger.js";
import type { AgentState, AgentName, AgentPlan, PlanStep, AgentMessage, ReflectionResult, MemoryEntry, HumanApprovalRequest } from "./state.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { CORE_AGENT_NAMES, AGENT_STATUS, PIPELINE_STATUS, RISK_LEVEL, APPROVED_BY, APPROVAL_RESOLUTION, APPROVAL_TYPE, MESSAGE_TYPE, MODE } from "../utils/constants.js";

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
  abstract run(inputState?: AgentState): Promise<AgentState>;

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

  protected recordReflection(reflection: ReflectionResult, state?: AgentState): void {
    const s = state || this.state;
    if (!s.reflectionHistory[this.agentName]) {
      s.reflectionHistory[this.agentName] = [];
    }
    s.reflectionHistory[this.agentName].push(reflection);
    
    logger.info(`[${this.agentName}] Reflection: ${reflection.score}/100, revise: ${reflection.shouldRevise}`);
  }

  protected async requestHumanApproval(plan: AgentPlan, state?: AgentState): Promise<boolean> {
    const s = state || this.state;
    if (s.commitAutoApprove) {
      plan.approved = true;
      plan.approvedBy = APPROVED_BY.SUPERVISOR;
      return true;
    }

    // Check if there's already a pending approval for this plan
    const existingApproval = s.humanApprovals.find(
      a => a.agent === this.agentName && a.type === APPROVAL_TYPE.PLAN && !a.resolved
    );
    
    if (existingApproval) {
      // If already resolved, return the result
      if (existingApproval.resolved) {
        plan.approved = existingApproval.resolution === APPROVAL_RESOLUTION.APPROVE;
        plan.approvedBy = existingApproval.resolution === APPROVAL_RESOLUTION.APPROVE ? APPROVED_BY.HUMAN : APPROVED_BY.SUPERVISOR;
        return plan.approved;
      }
      // If pending but not resolved, signal to graph to wait
      s.status = PIPELINE_STATUS.AWAITING_HUMAN;
      this.updateStatus(AGENT_STATUS.AWAITING_APPROVAL, s);
      return false;
    }

    // Create new approval request for LangGraph interrupt
    const request: HumanApprovalRequest = {
      id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      agent: this.agentName,
      type: APPROVAL_TYPE.PLAN,
      title: `Approve plan for ${this.agentName}`,
      description: `Goal: ${plan.goal}\nSteps: ${plan.steps.length}\nRisk: ${plan.riskLevel}`,
      data: plan,
      options: [
        { label: "Approve", value: APPROVAL_RESOLUTION.APPROVE },
        { label: "Reject", value: APPROVAL_RESOLUTION.REJECT },
        { label: "Modify", value: "modify" },
      ],
      defaultOption: APPROVAL_RESOLUTION.APPROVE,
      createdAt: Date.now(),
      resolved: false,
    };

    s.humanApprovals.push(request);
    s.status = PIPELINE_STATUS.AWAITING_HUMAN;
    this.updateStatus(AGENT_STATUS.AWAITING_APPROVAL, s);
    
    logger.warn(`[${this.agentName}] Awaiting human approval for plan (${request.id})`);
    
    // Return false to signal that execution should pause for approval
    // The graph's humanApprovalNode will interrupt and wait for resolution
    return false;
  }

  protected getAvailableTools(): ToolDefinition[] {
    return createAgentTools(this.taskContext.reader, this.taskContext.runner, this.taskContext.codebasePath);
  }

  protected updateStatus(status: AgentState["agentStatus"][AgentName], state?: AgentState): void {
    const s = state || this.state;
    s.agentStatus[this.agentName] = status;
    s.currentAgent = this.agentName;
  }

  protected recordStep(name: string, output: string, decision: string, state?: AgentState): void {
    const s = state || this.state;
    s.stepHistory.push({
      name,
      timestamp: Date.now(),
      agent: this.agentName,
      output: output.slice(0, 200),
      decision,
    });
  }

  protected sendMessage(to: AgentName | typeof MESSAGE_TYPE.BROADCAST, type: AgentMessage["type"], payload: unknown, correlationId?: string): void {
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
    
    if (this.state.memoryStore) {
      this.state.memoryStore.store(memoryEntry).catch(err => 
        logger.warn(`[${this.agentName}] Failed to store memory: ${err}`)
      );
    }
    
    this.state.memory.push(memoryEntry);
  }

  protected recall(type: MemoryEntry["type"], tags: string[], limit = 5): MemoryEntry[] {
    return this.state.memory
      .filter(m => m.type === type && tags.some(t => m.metadata.tags.includes(t)))
      .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
      .slice(0, limit);
  }

  protected async recallFromStore(type: MemoryEntry["type"], tags: string[], limit = 5): Promise<MemoryEntry[]> {
    if (!this.state.memoryStore) {
      return this.recall(type, tags, limit);
    }
    return this.state.memoryStore.retrieve(type, tags, limit);
  }
}
