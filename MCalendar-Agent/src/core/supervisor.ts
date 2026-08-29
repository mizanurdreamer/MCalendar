import type { AgentState, AgentName, AgentMessage, AgentPlan, PlanStep, HumanApprovalRequest } from "./state.js";
import { BaseAgent } from "./base_agent.js";
import { logger } from "../utils/logger.js";
import { metrics } from "./metrics.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { CORE_AGENT_NAMES, GRAPH_NODE, ROUTING_ACTION, PIPELINE_STATUS, MODE, APPROVAL_RESOLUTION, APPROVED_BY } from "../utils/constants.js";

export type RoutingDecision = 
  | { action: typeof ROUTING_ACTION.ROUTE; nextAgent: AgentName; reason: string; planStep?: PlanStep }
  | { action: typeof ROUTING_ACTION.PARALLEL; agents: AgentName[]; reason: string; planSteps?: PlanStep[] }
  | { action: typeof ROUTING_ACTION.WAIT; reason: string }
  | { action: typeof ROUTING_ACTION.COMPLETE; reason: string }
  | { action: typeof ROUTING_ACTION.FAIL; reason: string }
  | { action: typeof ROUTING_ACTION.REPLAN; reason: string }
  | { action: typeof ROUTING_ACTION.REQUEST_APPROVAL; request: HumanApprovalRequest };

export class Supervisor {
  private state: AgentState;
  private agents: Map<AgentName, BaseAgent> = new Map();
  private routingHistory: Array<{ from: AgentName; to: AgentName; decision: RoutingDecision; timestamp: number }> = [];
  currentPlanStepIndex = 0;

  constructor(state: AgentState) {
    // Clone state to prevent reference aliasing — executeDecision() mutates state in-place,
    // and if we hold the same reference, extractStateChanges() becomes a no-op
    this.state = { ...state };
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

    if (this.state.status === PIPELINE_STATUS.AWAITING_HUMAN) {
      return this.checkHumanApprovals();
    }

    if (this.state.status === PIPELINE_STATUS.COMPLETED) {
      return { action: ROUTING_ACTION.COMPLETE, reason: "Pipeline already completed" };
    }

    if (this.state.status === PIPELINE_STATUS.FAILED) {
      // Trigger replanning on failure
      return { action: ROUTING_ACTION.REPLAN, reason: `Agent failed: ${this.state.error || "Unknown failure"}` };
    }

    // Check for replanning triggers based on reflection quality
    const replanDecision = this.checkReplanTriggers();
    if (replanDecision) {
      return replanDecision;
    }

    const decision = await this.determineNextAgent();
    this.recordRouting(currentAgent, decision);
    return decision;
  }

  private checkReplanTriggers(): RoutingDecision | null {
    // Trigger replanning if average reflection score is too low
    const allReflections = Object.values(this.state.reflectionHistory).flat();
    if (allReflections.length >= 3) {
      const avgScore = allReflections.reduce((sum, r) => sum + r.score, 0) / allReflections.length;
      if (avgScore < 50) {
        logger.warn(`[Supervisor] Low average reflection score (${avgScore.toFixed(0)}), triggering replan`);
        return { action: ROUTING_ACTION.REPLAN, reason: `Average reflection score too low: ${avgScore.toFixed(0)}/100` };
      }
    }

    // Trigger replanning if same error pattern repeats
    const recentErrors = this.state.retryHistory.slice(-3).map(r => r.errors[0]?.slice(0, 100));
    if (recentErrors.length >= 3 && new Set(recentErrors).size === 1) {
      logger.warn(`[Supervisor] Repeated error pattern detected, triggering replan`);
      return { action: ROUTING_ACTION.REPLAN, reason: "Same error pattern repeating across retries" };
    }

    // Trigger replanning if too many steps without progress
    if (this.state.stepHistory.length > 10) {
      const recentSteps = this.state.stepHistory.slice(-5);
      const uniqueDecisions = new Set(recentSteps.map(s => s.decision));
      if (uniqueDecisions.size === 1 && recentSteps[0].decision !== "next") {
        logger.warn(`[Supervisor] Pipeline appears stuck, triggering replan`);
        return { action: ROUTING_ACTION.REPLAN, reason: "Pipeline stuck in same decision pattern" };
      }
    }

    // Adaptive retry: if reflection scores are declining, reduce max retries
    if (allReflections.length >= 2) {
      const recentScores = allReflections.slice(-2).map(r => r.score);
      if (recentScores[1] < recentScores[0] - 15) {
        logger.warn(`[Supervisor] Reflection score declining (${recentScores[0]} → ${recentScores[1]}), suggesting replan`);
        return { action: ROUTING_ACTION.REPLAN, reason: `Reflection score declining: ${recentScores[0]} → ${recentScores[1]}` };
      }
    }

    return null;
  }

  private async determineNextAgent(): Promise<RoutingDecision> {
    // First, check if we have a master plan to follow
    const masterPlan = this.state.plans?.planner;
    if (masterPlan && masterPlan.steps.length > 0) {
      return this.followMasterPlan(masterPlan);
    }

    // Fallback to hardcoded routing if no plan
    const { mode, currentAgent, agentStatus, issueAnalysis, commitAnalysis, testResult, retries, maxRetries } = this.state;

    if (mode === MODE.ISSUE) {
      return this.routeIssueMode(currentAgent, agentStatus, issueAnalysis, testResult, retries, maxRetries);
    } else {
      return this.routeCommitMode(currentAgent, agentStatus, commitAnalysis, testResult, retries, maxRetries);
    }
  }

  private followMasterPlan(masterPlan: AgentPlan): RoutingDecision {
    // Find the next incomplete step in the master plan
    const currentAgent = this.state.currentAgent;
    
    // If we're at supervisor, find the first pending step
    if (currentAgent === CORE_AGENT_NAMES.SUPERVISOR) {
      const nextStep = masterPlan.steps.find((step, idx) => idx >= this.currentPlanStepIndex);
      if (nextStep) {
        const stepIndex = masterPlan.steps.indexOf(nextStep);
        // Increment so next time we look for the step AFTER this one
        this.currentPlanStepIndex = stepIndex + 1;
        this.state.planStepIndex = this.currentPlanStepIndex;
        
        if (nextStep.canRunParallel) {
          // Find all parallel steps at this index
          const parallelSteps = masterPlan.steps.filter((s, idx) => 
            idx >= stepIndex && s.canRunParallel && s.dependsOn?.every(d => 
              masterPlan.steps.some(ms => ms.id === d && masterPlan.steps.indexOf(ms) < stepIndex)
            )
          );
          if (parallelSteps.length > 1) {
            return { 
              action: ROUTING_ACTION.PARALLEL, 
              agents: parallelSteps.map(s => s.agent!).filter((a): a is AgentName => !!a),
              reason: `Parallel execution: ${parallelSteps.map(s => s.id).join(", ")}`,
              planSteps: parallelSteps
            };
          }
        }
        return { 
          action: ROUTING_ACTION.ROUTE, 
          nextAgent: nextStep.agent!, 
          reason: nextStep.reasoning || nextStep.expectedOutcome,
          planStep: nextStep
        };
      }
      // All steps complete
      return { action: ROUTING_ACTION.COMPLETE, reason: "Master plan completed" };
    }

    // Check if current agent matches expected plan step
    const expectedStep = masterPlan.steps[this.currentPlanStepIndex];
    if (expectedStep && expectedStep.agent === currentAgent) {
      // Current agent completed its step, move to next
      this.currentPlanStepIndex++;
      this.state.planStepIndex = this.currentPlanStepIndex;
      
      // Find the next step after incrementing
      const nextStep = masterPlan.steps[this.currentPlanStepIndex];
      if (nextStep) {
        return { 
          action: ROUTING_ACTION.ROUTE, 
          nextAgent: nextStep.agent!, 
          reason: nextStep.reasoning || nextStep.expectedOutcome,
          planStep: nextStep
        };
      }
      // All steps complete
      return { action: ROUTING_ACTION.COMPLETE, reason: "Master plan completed" };
    }

    // If current agent doesn't match, check if it completed a step
    if (expectedStep && expectedStep.agent !== currentAgent) {
      // Maybe we need to route to the expected agent
      if (expectedStep.agent) {
        return { 
          action: ROUTING_ACTION.ROUTE, 
          nextAgent: expectedStep.agent, 
          reason: `Following master plan: ${expectedStep.reasoning || expectedStep.expectedOutcome}`,
          planStep: expectedStep
        };
      }
    }

    // Fallback
    return { action: ROUTING_ACTION.COMPLETE, reason: "Master plan completed" };
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
      case CORE_AGENT_NAMES.SUPERVISOR:
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_ISSUE_ANALYZER, reason: "Start issue analysis" };

      case AGENT_NAMES.AGENT_ISSUE_ANALYZER:
        if (!issueAnalysis?.needs_tests) {
          return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "No tests needed, summarize" };
        }
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: "Generate tests from analysis" };

      case AGENT_NAMES.AGENT_TESTS_GENERATOR:
        return { action: ROUTING_ACTION.ROUTE, nextAgent: GRAPH_NODE.RUN_TESTS as AgentName, reason: "Run generated tests" };

      case GRAPH_NODE.RUN_TESTS as AgentName:
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_REVIEWER, reason: "Review test results" };

      case AGENT_NAMES.AGENT_TESTS_REVIEWER:
        if (testResult?.success) {
          return { action: ROUTING_ACTION.PARALLEL, agents: [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, AGENT_NAMES.AGENT_SUMMARIZE], reason: "Tests passed, generate report and summarize in parallel" };
        }
        if (retries < maxRetries) {
          this.state.retries = retries + 1;
          metrics.recordRetry();
          logger.info(`[Supervisor] Retry ${this.state.retries}/${maxRetries}: routing back to generator with fixes`);
          return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: `Tests failed, retry ${this.state.retries}/${maxRetries}` };
        }
        return { action: ROUTING_ACTION.FAIL, reason: `Tests failed after ${maxRetries} retries` };

      case AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR:
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "Report generated, summarize" };

      case AGENT_NAMES.AGENT_SUMMARIZE:
        return { action: ROUTING_ACTION.COMPLETE, reason: "Issue pipeline complete" };

      default:
        return { action: ROUTING_ACTION.FAIL, reason: `Unknown agent in issue mode: ${currentAgent}` };
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
      case CORE_AGENT_NAMES.SUPERVISOR:
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_COMMIT_ANALYZER, reason: "Start commit analysis" };

      case AGENT_NAMES.AGENT_COMMIT_ANALYZER:
        if (!commitAnalysis?.needsTests) {
          return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "No tests needed for this commit" };
        }
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: "Generate tests for commit changes" };

      case AGENT_NAMES.AGENT_TESTS_GENERATOR:
        return { action: ROUTING_ACTION.ROUTE, nextAgent: GRAPH_NODE.RUN_TESTS as AgentName, reason: "Run generated tests" };

      case GRAPH_NODE.RUN_TESTS as AgentName:
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_REVIEWER, reason: "Review test results" };

      case AGENT_NAMES.AGENT_TESTS_REVIEWER:
        if (testResult?.success) {
          return { action: ROUTING_ACTION.PARALLEL, agents: [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, AGENT_NAMES.AGENT_SUMMARIZE], reason: "Tests passed, generate report and summarize in parallel" };
        }
        if (retries < maxRetries) {
          this.state.retries = retries + 1;
          metrics.recordRetry();
          logger.info(`[Supervisor] Retry ${this.state.retries}/${maxRetries}: routing back to generator with fixes`);
          return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: `Tests failed, retry ${this.state.retries}/${maxRetries}` };
        }
        return { action: ROUTING_ACTION.FAIL, reason: `Tests failed after ${maxRetries} retries` };

      case AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR:
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "Report generated, summarize" };

      case AGENT_NAMES.AGENT_SUMMARIZE:
        return { action: ROUTING_ACTION.COMPLETE, reason: "Commit pipeline complete" };

      default:
        return { action: ROUTING_ACTION.FAIL, reason: `Unknown agent in commit mode: ${currentAgent}` };
    }
  }

  private checkHumanApprovals(): RoutingDecision {
    const pending = this.state.humanApprovals.find(a => !a.resolved);
    if (pending) {
      return { action: ROUTING_ACTION.WAIT, reason: `Awaiting human approval: ${pending.title}` };
    }
    this.state.status = PIPELINE_STATUS.RUNNING;
    return { action: ROUTING_ACTION.ROUTE, nextAgent: this.state.currentAgent, reason: "Approval resolved, continuing" };
  }

  async executeDecision(decision: RoutingDecision): Promise<AgentState> {
    switch (decision.action) {
      case ROUTING_ACTION.ROUTE:
        return this.executeAgent(decision.nextAgent);

      case ROUTING_ACTION.PARALLEL:
        return this.executeParallel(decision.agents);

      case ROUTING_ACTION.WAIT:
        logger.info(`[Supervisor] Waiting: ${decision.reason}`);
        return this.state;

      case ROUTING_ACTION.COMPLETE:
        this.state.status = PIPELINE_STATUS.COMPLETED;
        this.state.currentAgent = CORE_AGENT_NAMES.SUPERVISOR as AgentName;
        logger.success(`[Supervisor] Pipeline complete: ${decision.reason}`);
        return this.state;

      case ROUTING_ACTION.FAIL:
        this.state.status = PIPELINE_STATUS.FAILED;
        this.state.error = decision.reason;
        logger.error(`[Supervisor] Pipeline failed: ${decision.reason}`);
        return this.state;

      case ROUTING_ACTION.REQUEST_APPROVAL:
        this.state.humanApprovals.push(decision.request);
        this.state.status = PIPELINE_STATUS.AWAITING_HUMAN;
        return this.state;

      case ROUTING_ACTION.REPLAN:
        logger.warn(`[Supervisor] Replanning triggered: ${decision.reason}`);
        this.state.status = PIPELINE_STATUS.RUNNING;
        // Reset to supervisor to trigger replanning
        this.state.currentAgent = CORE_AGENT_NAMES.SUPERVISOR;
        // The next route() call will trigger replanning via the master plan
        return this.state;
    }
  }

  private async executeAgent(agentName: AgentName): Promise<AgentState> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      this.state.status = PIPELINE_STATUS.FAILED;
      this.state.error = `Agent not registered: ${agentName}`;
      return this.state;
    }

    this.state.currentAgent = agentName;
    logger.info(`[Supervisor] Executing agent: ${agentName}`);

    try {
      return await agent.run();
    } catch (err) {
      this.state.status = PIPELINE_STATUS.FAILED;
      this.state.error = `Agent ${agentName} failed: ${err}`;
      logger.error(`[Supervisor] Agent ${agentName} failed: ${err}`);
      return this.state;
    }
  }

  private async executeParallel(agents: AgentName[]): Promise<AgentState> {
    logger.info(`[Supervisor] Executing parallel: ${agents.join(", ")}`);
    
    // Create state copies for each agent to prevent race conditions
    const stateCopies = agents.map(() => ({ ...this.state }));
    
    const promises = agents.map(async (name, index) => {
      const agent = this.agents.get(name);
      if (!agent) throw new Error(`Agent not registered: ${name}`);
      
      // Run agent with its own state copy
      const agentState = await agent.run(stateCopies[index]);
      return { agentName: name, state: agentState };
    });

    try {
      const results = await Promise.all(promises);
      
      // Merge state changes from all parallel agents
      for (const { agentName, state: agentState } of results) {
        this.mergeAgentState(agentName, agentState);
      }
      
      // Reset currentAgent to supervisor after parallel execution
      this.state.currentAgent = CORE_AGENT_NAMES.SUPERVISOR;
      
      return this.state;
    } catch (err) {
      this.state.status = PIPELINE_STATUS.FAILED;
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