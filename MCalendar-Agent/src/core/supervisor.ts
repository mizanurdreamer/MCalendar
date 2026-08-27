import type { AgentState, AgentName, AgentMessage, AgentPlan, PlanStep, HumanApprovalRequest } from "./state.js";
import { BaseAgent } from "./base_agent.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";

export type RoutingDecision = 
  | { action: "route"; nextAgent: AgentName; reason: string; planStep?: PlanStep }
  | { action: "parallel"; agents: AgentName[]; reason: string; planSteps?: PlanStep[] }
  | { action: "wait"; reason: string }
  | { action: "complete"; reason: string }
  | { action: "fail"; reason: string }
  | { action: "replan"; reason: string }
  | { action: "request_approval"; request: HumanApprovalRequest };

export class Supervisor {
  private state: AgentState;
  private agents: Map<AgentName, BaseAgent> = new Map();
  private routingHistory: Array<{ from: AgentName; to: AgentName; decision: RoutingDecision; timestamp: number }> = [];
  private currentPlanStepIndex = 0;

  constructor(state: AgentState) {
    this.state = state;
    // Initialize plan step index from state
    this.currentPlanStepIndex = state.planStepIndex ?? 0;
  }

  registerAgent(name: AgentName, agent: BaseAgent): void {
    this.agents.set(name, agent);
    logger.info(`[Supervisor] Registered agent: ${name}`);
  }

  async route(): Promise<RoutingDecision> {
    const currentAgent = this.state.currentAgent;
    const mode = this.state.mode;

    logger.info(`[Supervisor] Routing from ${currentAgent} (mode: ${mode})`);

    if (this.state.status === "awaiting_human") {
      return this.checkHumanApprovals();
    }

    if (this.state.status === "failed") {
      // Trigger replanning on failure
      return { action: "replan", reason: `Agent failed: ${this.state.error || "Unknown failure"}` };
    }

    const decision = await this.determineNextAgent();
    this.recordRouting(currentAgent, decision);
    return decision;
  }

  private async determineNextAgent(): Promise<RoutingDecision> {
    // First, check if we have a master plan to follow
    const masterPlan = this.state.plans?.planner;
    if (masterPlan && masterPlan.steps.length > 0) {
      return this.followMasterPlan(masterPlan);
    }

    // Fallback to hardcoded routing if no plan
    const { mode, currentAgent, agentStatus, issueAnalysis, commitAnalysis, testResult, retries, maxRetries } = this.state;

    if (mode === "issue") {
      return this.routeIssueMode(currentAgent, agentStatus, issueAnalysis, testResult, retries, maxRetries);
    } else {
      return this.routeCommitMode(currentAgent, agentStatus, commitAnalysis, testResult, retries, maxRetries);
    }
  }

  private followMasterPlan(masterPlan: AgentPlan): RoutingDecision {
    // Find the next incomplete step in the master plan
    const currentAgent = this.state.currentAgent;
    
    // If we're at supervisor, find the first pending step
    if (currentAgent === "supervisor") {
      const nextStep = masterPlan.steps.find((step, idx) => idx >= this.currentPlanStepIndex);
      if (nextStep) {
        this.currentPlanStepIndex = masterPlan.steps.indexOf(nextStep);
        this.state.planStepIndex = this.currentPlanStepIndex;
        if (nextStep.canRunParallel) {
          // Find all parallel steps at this index
          const parallelSteps = masterPlan.steps.filter((s, idx) => 
            idx >= this.currentPlanStepIndex && s.canRunParallel && s.dependsOn?.every(d => 
              masterPlan.steps.some(ms => ms.id === d && masterPlan.steps.indexOf(ms) < this.currentPlanStepIndex)
            )
          );
          if (parallelSteps.length > 1) {
            return { 
              action: "parallel", 
              agents: parallelSteps.map(s => s.agent!).filter((a): a is AgentName => !!a),
              reason: `Parallel execution: ${parallelSteps.map(s => s.id).join(", ")}`,
              planSteps: parallelSteps
            };
          }
        }
        return { 
          action: "route", 
          nextAgent: nextStep.agent!, 
          reason: nextStep.reasoning || nextStep.expectedOutcome,
          planStep: nextStep
        };
      }
      // All steps complete
      return { action: "complete", reason: "Master plan completed" };
    }

    // Check if current agent matches expected plan step
    const expectedStep = masterPlan.steps[this.currentPlanStepIndex];
    if (expectedStep && expectedStep.agent === currentAgent) {
      // Current agent matches expected step, move to next
      this.currentPlanStepIndex++;
      this.state.planStepIndex = this.currentPlanStepIndex;
      return this.followMasterPlan(masterPlan);
    }

    // If current agent doesn't match, check if it completed a step
    if (expectedStep && expectedStep.agent !== currentAgent) {
      // Maybe we need to route to the expected agent
      if (expectedStep.agent) {
        return { 
          action: "route", 
          nextAgent: expectedStep.agent, 
          reason: `Following master plan: ${expectedStep.reasoning || expectedStep.expectedOutcome}`,
          planStep: expectedStep
        };
      }
    }

    // Fallback
    return { action: "complete", reason: "Master plan completed" };
  }

  private routeIssueMode(
    currentAgent: AgentName,
    agentStatus: Record<AgentName, import("./state.js").AgentStatus>,
    issueAnalysis: AgentState["issueAnalysis"],
    testResult: AgentState["testResult"],
    retries: number,
    maxRetries: number
  ): RoutingDecision {
    switch (currentAgent) {
      case "supervisor":
        return { action: "route", nextAgent: AGENT_NAMES.AGENT_ISSUE_ANALYZER, reason: "Start issue analysis" };

      case AGENT_NAMES.AGENT_ISSUE_ANALYZER:
        if (!issueAnalysis?.needs_tests) {
          return { action: "route", nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "No tests needed, summarize" };
        }
        return { action: "route", nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: "Generate tests from analysis" };

      case AGENT_NAMES.AGENT_TESTS_GENERATOR:
        return { action: "route", nextAgent: AGENT_NAMES.AGENT_TESTS_REVIEWER, reason: "Review generated tests" };

      case AGENT_NAMES.AGENT_TESTS_REVIEWER:
        if (testResult?.success) {
          return { action: "parallel", agents: [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, AGENT_NAMES.AGENT_SUMMARIZE], reason: "Tests passed, generate report and summarize in parallel" };
        }
        if (retries < maxRetries) {
          return { action: "route", nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: "Tests failed, regenerate with fixes" };
        }
        return { action: "parallel", agents: [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, AGENT_NAMES.AGENT_SUMMARIZE], reason: "Max retries reached, generate report and summarize in parallel" };

      case AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR:
        return { action: "route", nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "Report generated, summarize" };

      case AGENT_NAMES.AGENT_SUMMARIZE:
        return { action: "complete", reason: "Issue pipeline complete" };

      default:
        return { action: "fail", reason: `Unknown agent in issue mode: ${currentAgent}` };
    }
  }

  private routeCommitMode(
    currentAgent: AgentName,
    agentStatus: Record<AgentName, import("./state.js").AgentStatus>,
    commitAnalysis: AgentState["commitAnalysis"],
    testResult: AgentState["testResult"],
    retries: number,
    maxRetries: number
  ): RoutingDecision {
    switch (currentAgent) {
      case "supervisor":
        return { action: "route", nextAgent: AGENT_NAMES.AGENT_COMMIT_ANALYZER, reason: "Start commit analysis" };

      case AGENT_NAMES.AGENT_COMMIT_ANALYZER:
        if (!commitAnalysis?.needsTests) {
          return { action: "route", nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "No tests needed for this commit" };
        }
        return { action: "route", nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: "Generate tests for commit changes" };

      case AGENT_NAMES.AGENT_TESTS_GENERATOR:
        return { action: "route", nextAgent: AGENT_NAMES.AGENT_TESTS_REVIEWER, reason: "Review generated tests" };

      case AGENT_NAMES.AGENT_TESTS_REVIEWER:
        if (testResult?.success) {
          return { action: "parallel", agents: [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, AGENT_NAMES.AGENT_SUMMARIZE], reason: "Tests passed, generate report and summarize in parallel" };
        }
        if (retries < maxRetries) {
          return { action: "route", nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: "Tests failed, regenerate with fixes" };
        }
        return { action: "parallel", agents: [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, AGENT_NAMES.AGENT_SUMMARIZE], reason: "Max retries reached, generate report and summarize in parallel" };

      case AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR:
        return { action: "route", nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "Report generated, summarize" };

      case AGENT_NAMES.AGENT_SUMMARIZE:
        return { action: "complete", reason: "Commit pipeline complete" };

      default:
        return { action: "fail", reason: `Unknown agent in commit mode: ${currentAgent}` };
    }
  }

  private checkHumanApprovals(): RoutingDecision {
    const pending = this.state.humanApprovals.find(a => !a.resolved);
    if (pending) {
      return { action: "wait", reason: `Awaiting human approval: ${pending.title}` };
    }
    this.state.status = "running";
    return { action: "route", nextAgent: this.state.currentAgent, reason: "Approval resolved, continuing" };
  }

  async executeDecision(decision: RoutingDecision): Promise<AgentState> {
    switch (decision.action) {
      case "route":
        return this.executeAgent(decision.nextAgent);

      case "parallel":
        return this.executeParallel(decision.agents);

      case "wait":
        logger.info(`[Supervisor] Waiting: ${decision.reason}`);
        return this.state;

      case "complete":
        this.state.status = "completed";
        logger.success(`[Supervisor] Pipeline complete: ${decision.reason}`);
        return this.state;

      case "fail":
        this.state.status = "failed";
        this.state.error = decision.reason;
        logger.error(`[Supervisor] Pipeline failed: ${decision.reason}`);
        return this.state;

      case "request_approval":
        this.state.humanApprovals.push(decision.request);
        this.state.status = "awaiting_human";
        return this.state;

      case "replan":
        logger.warn(`[Supervisor] Replanning triggered: ${decision.reason}`);
        this.state.status = "running";
        // Reset to supervisor to trigger replanning
        this.state.currentAgent = "supervisor";
        // The next route() call will trigger replanning via the master plan
        return this.state;
    }
  }

  private async executeAgent(agentName: AgentName): Promise<AgentState> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      this.state.status = "failed";
      this.state.error = `Agent not registered: ${agentName}`;
      return this.state;
    }

    this.state.currentAgent = agentName;
    logger.info(`[Supervisor] Executing agent: ${agentName}`);

    try {
      return await agent.run();
    } catch (err) {
      this.state.status = "failed";
      this.state.error = `Agent ${agentName} failed: ${err}`;
      logger.error(`[Supervisor] Agent ${agentName} failed: ${err}`);
      return this.state;
    }
  }

  private async executeParallel(agents: AgentName[]): Promise<AgentState> {
    logger.info(`[Supervisor] Executing parallel: ${agents.join(", ")}`);
    
    const promises = agents.map(async (name) => {
      const agent = this.agents.get(name);
      if (!agent) throw new Error(`Agent not registered: ${name}`);
      
      // Run agent and capture its state changes
      const agentState = await agent.run();
      return { agentName: name, state: agentState };
    });

    try {
      const results = await Promise.all(promises);
      
      // Merge state changes from all parallel agents
      for (const { agentName, state: agentState } of results) {
        this.mergeAgentState(agentName, agentState);
      }
      
      return this.state;
    } catch (err) {
      this.state.status = "failed";
      this.state.error = `Parallel execution failed: ${err}`;
      return this.state;
    }
  }

  private mergeAgentState(agentName: AgentName, agentState: AgentState): void {
    // Merge key fields that agents modify
    const mergeFields: (keyof AgentState)[] = [
      "testFilename", "testContent", "testResult", "report", "reportPath", 
      "summary", "prUrl", "branchName", "retries", "retryHistory",
      "projectContext", "issueAnalysis", "commitAnalysis", "status", "error"
    ];
    
    for (const field of mergeFields) {
      if (agentState[field] !== undefined && agentState[field] !== this.state[field]) {
        (this.state as any)[field] = agentState[field];
      }
    }
    
    // Merge arrays
    if (agentState.retryHistory.length > this.state.retryHistory.length) {
      this.state.retryHistory = agentState.retryHistory;
    }
    if (agentState.stepHistory.length > this.state.stepHistory.length) {
      this.state.stepHistory = agentState.stepHistory;
    }
    if (agentState.messages.length > this.state.messages.length) {
      this.state.messages = agentState.messages;
    }
    if (agentState.memory.length > this.state.memory.length) {
      this.state.memory = agentState.memory;
    }
    
    // Merge reflection history
    for (const [agent, reflections] of Object.entries(agentState.reflectionHistory)) {
      if (!this.state.reflectionHistory[agent as AgentName]) {
        this.state.reflectionHistory[agent as AgentName] = [];
      }
      this.state.reflectionHistory[agent as AgentName].push(...reflections);
    }
  }

  private recordRouting(from: AgentName, decision: RoutingDecision): void {
    const to = "nextAgent" in decision ? decision.nextAgent : 
               "agents" in decision ? decision.agents.join(",") : "terminal";
    
    this.routingHistory.push({
      from,
      to: to as AgentName,
      decision,
      timestamp: Date.now(),
    });
  }

  getRoutingHistory() {
    return this.routingHistory;
  }

  resolveApproval(requestId: string, resolution: string): void {
    const request = this.state.humanApprovals.find(a => a.id === requestId);
    if (request) {
      request.resolved = true;
      request.resolution = resolution;
      logger.info(`[Supervisor] Approval ${requestId} resolved: ${resolution}`);
    }
  }
}