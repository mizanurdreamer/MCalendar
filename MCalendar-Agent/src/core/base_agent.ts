import type { ProviderInterface, ChatMessage, ContentBlock, Tool, ToolDefinition } from "../providers/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { getToolRegistry, type AgentRole, type ToolHandlerContext } from "./tool_registry.js";
import { logger } from "../utils/logger.js";
import { metrics } from "./metrics.js";
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
  promptCaching?: boolean;
  maxRetries?: number;
  currentPlanStep?: PlanStep;
  overallPlan?: AgentPlan;
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

    const promptCaching = this.state.agentConfig[this.agentName]?.promptCaching ?? true;
    logger.debug(`[${this.agentName}] Reflect - prompt caching: ${promptCaching ? "enabled" : "disabled"}`);
    
    try {
      const response = await this.taskContext.provider.chat({
        system: "You are a harsh but fair critic. Output ONLY valid JSON.",
        messages: [{ role: "user", content: criticPrompt }],
        maxTokens: 2048,
        temperature: 0.1,
        promptCaching,
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

    // Store reflection in memory for cross-run learning
    this.remember({
      type: "lesson_learned",
      content: JSON.stringify({
        score: reflection.score,
        strengths: reflection.strengths,
        weaknesses: reflection.weaknesses,
        suggestions: reflection.suggestions,
      }),
      metadata: {
        project: this.state.projectName || "unknown",
        agent: this.agentName,
        success: reflection.score >= 70,
        tags: ["reflection", this.agentName, reflection.shouldRevise ? "needs-revision" : "accepted"],
        source: "self-reflection",
      },
    });
  }

  protected async requestHumanApproval(plan: AgentPlan, state?: AgentState): Promise<boolean> {
    const s = state || this.state;
    
    // Check risk level - only require approval for high-risk actions
    const requireApproval = s.enableHumanGates && plan.riskLevel === RISK_LEVEL.HIGH;
    
    if (s.commitAutoApprove && !requireApproval) {
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
      // If pending but not resolved, wait for resolution
      logger.warn(`[${this.agentName}] Waiting for human approval (${existingApproval.id})`);
      return this.waitForApprovalResolution(existingApproval.id, s);
    }

    // Create new approval request
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
    
    // Wait for human resolution
    return this.waitForApprovalResolution(request.id, s);
  }
  
  private async waitForApprovalResolution(approvalId: string, state: AgentState): Promise<boolean> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const approval = state.humanApprovals.find(a => a.id === approvalId);
        if (approval?.resolved) {
          clearInterval(checkInterval);
          const approved = approval.resolution === APPROVAL_RESOLUTION.APPROVE;
          logger.info(`[${this.agentName}] Approval ${approved ? "granted" : "rejected"} (${approvalId})`);
          resolve(approved);
        }
      }, 1000);
    });
  }

  protected getAvailableTools(): ToolDefinition[] {
    const role = this.agentNameToRole(this.agentName);
    return getToolRegistry().getByRole(role);
  }

  private agentNameToRole(agentName: AgentName): AgentRole {
    const mapping: Record<string, AgentRole> = {
      [AGENT_NAMES.AGENT_ISSUE_ANALYZER]: "issue_analyzer",
      [AGENT_NAMES.AGENT_COMMIT_ANALYZER]: "commit_analyzer",
      [AGENT_NAMES.AGENT_TESTS_GENERATOR]: "tests_generator",
      [AGENT_NAMES.AGENT_TESTS_REVIEWER]: "tests_reviewer",
      [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR]: "tests_report_generator",
      [AGENT_NAMES.AGENT_SUMMARIZE]: "summarize",
    };
    return mapping[agentName] || "issue_analyzer";
  }

  protected updateStatus(status: AgentState["agentStatus"][AgentName], state?: AgentState): void {
    const s = state || this.state;
    s.agentStatus[this.agentName] = status;
    s.currentAgent = this.agentName;
  }

  public updateTaskContext(updates: Partial<TaskContext>): void {
    this.taskContext = { ...this.taskContext, ...updates };
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

  protected initCommunication(subscriptions: AgentName[]): void {
    subscriptions.forEach(agentName => {
      this.subscribeToMessages((message) => {
        logger.debug(`[${this.agentName}] Received message from ${message.from}: ${message.type}`);
      });
    });
  }

  protected getMessages(from?: AgentName, type?: AgentMessage["type"]): AgentMessage[] {
    return this.state.messages.filter(m => 
      (m.to === this.agentName || m.to === "broadcast") && 
      (!from || m.from === from) &&
      (!type || m.type === type)
    );
  }

  protected getLatestMessage(from?: AgentName, type?: AgentMessage["type"]): AgentMessage | null {
    const messages = this.getMessages(from, type);
    return messages.length > 0 ? messages[messages.length - 1] : null;
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
        logger.error(`[${this.agentName}] Failed to store memory: ${err}`)
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

  /**
   * Recall relevant lessons from past runs for this agent type.
   * Returns a formatted string to inject into agent context.
   */
  protected async recallLessons(context?: string): Promise<string> {
    const lessons = await this.recallFromStore("lesson_learned", [this.agentName], 5);
    if (lessons.length === 0) return "";

    const formatted = lessons.map((l, i) => {
      const parsed = JSON.parse(l.content);
      return `Lesson ${i + 1} (score: ${parsed.score}/100):\n- Strengths: ${parsed.strengths?.join(", ") || "none"}\n- Weaknesses: ${parsed.weaknesses?.join(", ") || "none"}\n- Suggestions: ${parsed.suggestions?.join(", ") || "none"}`;
    }).join("\n\n");

    return `\nPAST LESSONS FROM PREVIOUS RUNS:\n${formatted}\n\nApply these lessons to improve your current work.`;
  }

  /**
   * Recall past error fixes relevant to current context.
   */
  protected async recallErrorFixes(errorPattern?: string): Promise<string> {
    const fixes = await this.recallFromStore("error_fix", [this.agentName], 3);
    if (fixes.length === 0) return "";

    const formatted = fixes.map((f, i) => {
      return `Fix ${i + 1}: ${f.content.slice(0, 300)}`;
    }).join("\n\n");

    return `\nPAST ERROR FIXES:\n${formatted}\n\nConsider these patterns when debugging.`;
  }

  /**
   * Recall test patterns that have worked before.
   */
  protected async recallTestPatterns(): Promise<string> {
    const patterns = await this.recallFromStore("test_pattern", ["playwright", "e2e"], 3);
    if (patterns.length === 0) return "";

    const formatted = patterns.map((p, i) => {
      return `Pattern ${i + 1}: ${p.content.slice(0, 500)}`;
    }).join("\n\n");

    return `\nPAST SUCCESSFUL TEST PATTERNS:\n${formatted}\n\nFollow these patterns for consistency.`;
  }

  /**
   * Shared agentic tool-use loop. All agents follow the same pattern:
   * 1. Send messages to LLM with tools
   * 2. If LLM calls tools → execute them, append results, loop
   * 3. If LLM stops → return final messages
   *
   * Subclasses can pass `onToolCall` to intercept specific tool calls (e.g., submit_analysis)
   * and return early with their parsed result.
   */
  protected async runToolLoop(params: {
    systemPrompt: string;
    userMessage: string;
    tools: ToolDefinition[];
    onToolCall?: (toolBlocks: { id: string; name: string; input: Record<string, unknown> }[]) => { intercept: true; result: unknown } | { intercept: false } | null;
    maxIterations?: number;
    agentName?: string;
  }): Promise<{ messages: ChatMessage[]; iterations: number; lastResponse?: ContentBlock[] }> {
    const { systemPrompt, userMessage, tools, onToolCall, agentName } = params;
    const maxIterations = params.maxIterations ?? this.state.maxIterations ?? 50;
    const tag = agentName ?? this.agentName;

    const messages: ChatMessage[] = [
      { role: "user", content: userMessage },
    ];

    let iteration = 0;
    let consecutiveErrors = 0;

    while (iteration < maxIterations) {
      iteration++;
      metrics.recordIteration();
      logger.debug(`[${tag}] Tool loop iteration ${iteration}`);

      // Proactive stuck detection
      if (consecutiveErrors >= 5) {
        logger.warn(`[${tag}] Agent stuck: ${consecutiveErrors} consecutive tool errors, injecting help guidance`);
        messages.push({
          role: "user",
          content: `You have encountered ${consecutiveErrors} consecutive tool errors. Please analyze what's going wrong and try a different approach. Consider reading different files, using different tools, or explaining what you need in text.`,
        });
        consecutiveErrors = 0;
      }

      const provider = this.taskContext.provider;
      const promptCaching = this.state.agentConfig[tag]?.promptCaching;
      
      // Log prompt caching status on first iteration
      if (iteration === 1) {
        logger.info(`[${tag}] Prompt caching: ${promptCaching ? "enabled" : "disabled"}`);
      }
      
      const response = await provider.chat({
        system: systemPrompt,
        messages,
        tools,
        maxTokens: this.state.agentConfig[tag]?.maxTokens,
        temperature: this.state.agentConfig[tag]?.temperature,
        promptCaching,
      });

      // Record token usage
      if (response.usage) {
        metrics.recordTokens(response.usage.inputTokens, response.usage.outputTokens);
      }

      messages.push({ role: "assistant", content: response.content });

      const toolBlocks = response.content.filter(
        (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
          b.type === "tool_use"
      );

      if (toolBlocks.length === 0 || response.stopReason !== "tool_use") {
        logger.debug(`[${tag}] Tool loop completed after ${iteration} iterations`);
        break;
      }

      // Let subclass intercept specific tool calls (e.g., submit_analysis)
      if (onToolCall) {
        const intercept = onToolCall(toolBlocks);
        if (intercept && intercept.intercept) {
          return { messages, iterations: iteration, lastResponse: response.content };
        }
      }

      // Execute remaining tools
      const toolResults: ContentBlock[] = [];
      for (const toolBlock of toolBlocks) {
        metrics.recordToolCall();

        logger.info(`[${tag}] Executing tool: ${toolBlock.name}`);
        const result = await getToolRegistry().execute(
          toolBlock.name,
          toolBlock.input,
          {
            codebasePath: this.taskContext.codebasePath,
            testOutputPath: this.taskContext.testOutputPath,
            testProjectPath: this.taskContext.testOutputPath,
          }
        );
        
        // Track consecutive errors
        if (result.startsWith("Error:") || result.includes("error")) {
          consecutiveErrors++;
        } else {
          consecutiveErrors = 0;
        }

        toolResults.push({
          type: "tool_result",
          toolUseId: toolBlock.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    if (iteration >= maxIterations) {
      logger.warn(`[${tag}] Tool loop hit max iterations (${maxIterations})`);
    }

    return { messages, iterations: iteration };
  }
}
