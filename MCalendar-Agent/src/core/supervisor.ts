import type { AgentState, AgentName, AgentMessage, AgentPlan, PlanStep, HumanApprovalRequest, RoutingHistoryEntry } from "./state.js";
import { BaseAgent } from "./base_agent.js";
import { logger } from "../utils/logger.js";
import { metrics } from "./metrics.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { agentEvents } from "./agent_events.js";
import { CORE_AGENT_NAMES, GRAPH_NODE, ROUTING_ACTION, PIPELINE_STATUS, MODE, AGENT_STATUS } from "../utils/constants.js";

export type RoutingDecision = 
  | { action: typeof ROUTING_ACTION.ROUTE; nextAgent: AgentName; reason: string }
  | { action: typeof ROUTING_ACTION.PARALLEL; agents: AgentName[]; reason: string }
  | { action: typeof ROUTING_ACTION.WAIT; reason: string }
  | { action: typeof ROUTING_ACTION.COMPLETE; reason: string }
  | { action: typeof ROUTING_ACTION.FAIL; reason: string }
  | { action: typeof ROUTING_ACTION.REPLAN; reason: string }
  | { action: typeof ROUTING_ACTION.REQUEST_APPROVAL; request: HumanApprovalRequest };

export class Supervisor {
  private state: AgentState;
  private agents: Map<AgentName, BaseAgent> = new Map();
  private routingHistory: RoutingHistoryEntry[] = [];

  constructor(state: AgentState) {
    this.state = { ...state };
    this.routingHistory = state.routingHistory ?? [];
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

    // Check if the current agent soft-failed (set agentStatus to FAILED without throwing)
    if (currentAgent && currentAgent !== CORE_AGENT_NAMES.SUPERVISOR) {
      const agentStatus = this.state.agentStatus?.[currentAgent];
      if (agentStatus === AGENT_STATUS.FAILED) {
        logger.warn(`[Supervisor] Agent ${currentAgent} soft-failed, triggering replan`);
        return { action: ROUTING_ACTION.REPLAN, reason: `Agent ${currentAgent} failed: ${this.state.error || "Unknown failure"}` };
      }
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

  private followPlan(): RoutingDecision | null {
    const plan = this.state.plan;
    if (!plan || !plan.steps || plan.steps.length === 0) return null;

    const idx = this.state.planStepIndex ?? 0;
    if (idx >= plan.steps.length) return null;

    const step = plan.steps[idx];

    // Evaluate skip condition
    if (step.skip) {
      // Guardrails: never skip critical agents
      if (this.isCriticalAgent(step.agent, this.state)) {
        logger.warn(`[Supervisor] Plan wants to skip ${step.agent} but it's critical — running anyway`);
        this.state.planStepIndex = idx + 1;
        return { action: ROUTING_ACTION.ROUTE, nextAgent: step.agent, reason: `Critical agent, ignoring skip: ${step.skip}` };
      }

      // Skip the agent
      logger.info(`[Supervisor] Skipping ${step.agent}: ${step.skip}`);
      this.state.planStepIndex = idx + 1;
      return this.followPlan();
    }

    // Don't skip — route to agent
    this.state.planStepIndex = idx + 1;
    return { action: ROUTING_ACTION.ROUTE, nextAgent: step.agent, reason: step.guidance || `Following plan` };
  }

  private isCriticalAgent(agent: AgentName, state: AgentState): boolean {
    // Never skip run_tests if we have a test file
    if (agent === (GRAPH_NODE.RUN_TESTS as AgentName) && state.testFilename) return true;
    // Never skip tests_reviewer if tests failed
    if (agent === AGENT_NAMES.AGENT_TESTS_REVIEWER && state.testResult && !state.testResult.success) return true;
    // Never skip summarize (terminal agent)
    if (agent === AGENT_NAMES.AGENT_SUMMARIZE) return true;
    return false;
  }

  private async determineNextAgent(): Promise<RoutingDecision> {
    // Try plan following first
    const planDecision = this.followPlan();
    if (planDecision) return planDecision;

    // Fall back to data-driven routing table
    return this.evaluateRoutingTable();
  }

  private evaluateRoutingTable(): RoutingDecision {
    const s = this.state;
    const currentAgent = s.currentAgent;
    const mode = s.mode;

    // Mode-specific entry point
    if (currentAgent === CORE_AGENT_NAMES.SUPERVISOR) {
      const entryAgent = mode === MODE.ISSUE
        ? AGENT_NAMES.AGENT_ISSUE_ANALYZER
        : AGENT_NAMES.AGENT_COMMIT_ANALYZER;
      const reason = mode === MODE.ISSUE ? "Start issue analysis" : "Start commit analysis";
      return { action: ROUTING_ACTION.ROUTE, nextAgent: entryAgent, reason };
    }

    // Analyzers -> generator or summarize
    if (currentAgent === AGENT_NAMES.AGENT_ISSUE_ANALYZER) {
      if (!s.issueAnalysis?.needs_tests) {
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "No tests needed, summarize" };
      }
      return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: "Generate tests from analysis" };
    }
    if (currentAgent === AGENT_NAMES.AGENT_COMMIT_ANALYZER) {
      if (!s.commitAnalysis?.needsTests) {
        return { action: ROUTING_ACTION.COMPLETE, reason: "Commit pipeline complete" };
      }
      return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: "Generate tests for commit changes" };
    }

    // Generator -> run_tests
    if (currentAgent === AGENT_NAMES.AGENT_TESTS_GENERATOR) {
      return { action: ROUTING_ACTION.ROUTE, nextAgent: GRAPH_NODE.RUN_TESTS as AgentName, reason: "Run generated tests" };
    }

    // run_tests -> reviewer
    if (currentAgent === (GRAPH_NODE.RUN_TESTS as AgentName)) {
      return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_REVIEWER, reason: "Review test results" };
    }

    // Reviewer branching
    if (currentAgent === AGENT_NAMES.AGENT_TESTS_REVIEWER) {
      if (s.testResult?.success) {
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, reason: "Tests passed, generate report" };
      }
      // Target source code issues -> code fixer
      if (s.targetCodeIssues && s.targetCodeIssues.length > 0 && (s.codeFixRetries ?? 0) < (s.maxCodeFixRetries ?? 2)) {
        s.codeFixRetries = (s.codeFixRetries ?? 0) + 1;
        logger.info(`[Supervisor] Code fix ${s.codeFixRetries}/${s.maxCodeFixRetries}: routing to code fixer for target source`);
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_CODE_FIXER, reason: `Fixing target source code (${s.codeFixRetries}/${s.maxCodeFixRetries})` };
      }
      // Test-scope retry
      if ((s.retries ?? 0) < (s.testReviewMaxRetries ?? 3)) {
        s.retries = (s.retries ?? 0) + 1;
        metrics.recordRetry();
        logger.info(`[Supervisor] Retry ${s.retries}/${s.testReviewMaxRetries}: routing back to generator with fixes`);
        return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_TESTS_GENERATOR, reason: `Tests failed, retry ${s.retries}/${s.testReviewMaxRetries}` };
      }
      return { action: ROUTING_ACTION.FAIL, reason: `Tests failed after ${s.testReviewMaxRetries} retries` };
    }

    // Code fixer -> re-run tests
    if (currentAgent === AGENT_NAMES.AGENT_CODE_FIXER) {
      return { action: ROUTING_ACTION.ROUTE, nextAgent: GRAPH_NODE.RUN_TESTS as AgentName, reason: "Re-run tests after source code fix" };
    }

    // Report -> summarize
    if (currentAgent === AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR) {
      return { action: ROUTING_ACTION.ROUTE, nextAgent: AGENT_NAMES.AGENT_SUMMARIZE, reason: "Report generated, summarize" };
    }

    // Summarize -> complete
    if (currentAgent === AGENT_NAMES.AGENT_SUMMARIZE) {
      const reason = mode === MODE.ISSUE ? "Issue pipeline complete" : "Commit pipeline complete";
      return { action: ROUTING_ACTION.COMPLETE, reason };
    }

    return { action: ROUTING_ACTION.FAIL, reason: `Unknown agent: ${currentAgent}` };
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
        return this.routeAgent(decision.nextAgent);

      case ROUTING_ACTION.PARALLEL:
        return this.routeAgents(decision.agents);

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

  private routeAgent(agentName: AgentName): AgentState {
    const graphNodes = [GRAPH_NODE.RUN_TESTS, GRAPH_NODE.HUMAN_APPROVAL] as string[];
    const isGraphNode = graphNodes.includes(agentName);

    if (!isGraphNode) {
      const agent = this.agents.get(agentName);
      if (!agent) {
        this.state.status = PIPELINE_STATUS.FAILED;
        this.state.error = `Agent not registered: ${agentName}`;
        return this.state;
      }

      // Pass plan context to agent
      const plan = this.state.plan;
      const stepIdx = (this.state.planStepIndex ?? 1) - 1;
      const currentStep = plan?.steps[stepIdx];
      agent.updateTaskContext({
        currentPlanStep: currentStep,
        overallPlan: plan,
      });
    }

    this.state.currentAgent = agentName;
    logger.info(`[Supervisor] Routing to agent: ${agentName}`);
    agentEvents.emitAgentStatus(agentName, "executing");

    return this.state;
  }

  private routeAgents(agents: AgentName[]): AgentState {
    logger.info(`[Supervisor] Routing to agents (sequential): ${agents.join(", ")}`);
    
    // Execute sequentially — parallel state merge has data loss issues
    // The agent node will run the first agent; subsequent agents routed via supervisor loop
    const firstAgent = agents[0];
    this.state.currentAgent = firstAgent;
    
    // Pass plan context to agent
    const plan = this.state.plan;
    const stepIdx = (this.state.planStepIndex ?? 1) - 1;
    const currentStep = plan?.steps[stepIdx];
    const agent = this.agents.get(firstAgent);
    if (agent) {
      agent.updateTaskContext({
        currentPlanStep: currentStep,
        overallPlan: plan,
      });
    }
    
    return this.state;
  }

  private recordRouting(from: AgentName, decision: RoutingDecision): void {
    const to = "nextAgent" in decision ? decision.nextAgent : 
               "agents" in decision ? decision.agents.join(",") : "terminal";
    
    const entry: RoutingHistoryEntry = {
      from,
      to: to as AgentName,
      reason: "reason" in decision ? decision.reason : "",
      timestamp: Date.now(),
    };
    
    this.routingHistory.push(entry);
    this.state.routingHistory = this.routingHistory;
  }
}