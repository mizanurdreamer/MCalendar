import { StateGraph, Annotation, START, END, Send, MemorySaver, BaseCheckpointSaver } from "@langchain/langgraph";
import type { AgentState, AgentName, AgentPlan, ReflectionResult } from "./state.js";
import { Supervisor } from "./supervisor.js";
import { BaseAgent } from "./base_agent.js";
import { AgentCritic } from "./agent_critic.js";
import { metrics } from "./metrics.js";
import { AdvancedPlanner, type CriticFeedback } from "./planner.js";
import { createMemoryStore, type MemoryStore } from "./memory.js";
import { MessageBus } from "./message_bus.js";
import { logger } from "../utils/logger.js";
import { Command, interrupt } from "@langchain/langgraph";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { CORE_AGENT_NAMES, GRAPH_NODE, MODE, PIPELINE_STATUS, ROUTING_ACTION } from "../utils/constants.js";

export interface AgenticGraphConfig {
  memoryType: "local" | "postgres";
  databaseUrl?: string;
  agentMemoryDatabaseUrl?: string;
  enableCritic: boolean;
  enableHumanGates: boolean;
  maxParallelAgents: number;
  checkpointer?: BaseCheckpointSaver;
}

const AgentStateAnnotation = Annotation.Root({
  mode: Annotation<typeof MODE.ISSUE | typeof MODE.COMMIT>(),
  runId: Annotation<string>(),
  issue: Annotation<any>(),
  commitDiff: Annotation<any>(),
  agentConfig: Annotation<any>(),
  // Heavy objects excluded from annotation to prevent V8 crash during checkpointing
  // reader, testReader, runner, git, githubClient, provider, memoryStore, messageBus
  // are passed via state but not serialized
  codebasePath: Annotation<string>(),
  testProjectPath: Annotation<string>(),
  testOutputPath: Annotation<string>(),
  projectName: Annotation<string>(),
  testReviewMaxRetries: Annotation<number>(),
  maxIterations: Annotation<number>(),
  maxPipelineSteps: Annotation<number>(),
  commitAutoApprove: Annotation<boolean>(),
  retries: Annotation<number>(),
  planStepIndex: Annotation<number>(),
  baseBranch: Annotation<string>(),
  branchName: Annotation<string>(),
  projectContext: Annotation<any>(),
  issueAnalysis: Annotation<any>(),
  commitAnalysis: Annotation<any>(),
  testFilename: Annotation<string>(),
  testContent: Annotation<string>(),
  testResult: Annotation<any>(),
  report: Annotation<string>(),
  reportPath: Annotation<string>(),
  summary: Annotation<string>(),
  prUrl: Annotation<string>(),
  retryHistory: Annotation<any[]>(),
  currentAgent: Annotation<AgentName>(),
  agentStatus: Annotation<any>(),
  plans: Annotation<any>(),
  messages: Annotation<any[]>(),
  memory: Annotation<any[]>(),
  reflectionHistory: Annotation<any>(),
  humanApprovals: Annotation<any[]>(),
  stepHistory: Annotation<any[]>(),
  status: Annotation<typeof PIPELINE_STATUS.RUNNING | typeof PIPELINE_STATUS.COMPLETED | typeof PIPELINE_STATUS.FAILED | typeof PIPELINE_STATUS.SKIPPED | typeof PIPELINE_STATUS.AWAITING_HUMAN>(),
  error: Annotation<string>(),
});

export class AgenticGraph {
  private graph: ReturnType<typeof StateGraph.prototype.compile>;
  private supervisor!: Supervisor;
  private memoryStore: MemoryStore;
  private messageBus: MessageBus;
  private planner!: AdvancedPlanner;
  private agents: Map<AgentName, BaseAgent> = new Map();
  private critics: Map<AgentName, AgentCritic> = new Map();
  private config: AgenticGraphConfig;
  private stepCounter = 0;
  private replanCounter = 0;
  private maxReplans = 3;

  constructor(config: Partial<AgenticGraphConfig> = {}) {
    this.config = {
      memoryType: "local",
      enableCritic: true,
      enableHumanGates: true,
      maxParallelAgents: 3,
      checkpointer: new MemorySaver(),
      ...config,
    };
    
    this.memoryStore = createMemoryStore(this.config.memoryType, this.config.agentMemoryDatabaseUrl || this.config.databaseUrl);
    this.messageBus = new MessageBus();
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const workflow = new StateGraph(AgentStateAnnotation);

    // Core nodes
    workflow.addNode(GRAPH_NODE.SUPERVISOR, this.supervisorNode.bind(this));
    workflow.addNode(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.agentNode(AGENT_NAMES.AGENT_ISSUE_ANALYZER));
    workflow.addNode(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.agentNode(AGENT_NAMES.AGENT_COMMIT_ANALYZER));
    workflow.addNode(AGENT_NAMES.AGENT_TESTS_GENERATOR, this.agentNode(AGENT_NAMES.AGENT_TESTS_GENERATOR));
    workflow.addNode(GRAPH_NODE.RUN_TESTS, this.runTestsNode.bind(this));
    workflow.addNode(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.agentNode(AGENT_NAMES.AGENT_TESTS_REVIEWER));
    workflow.addNode(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, this.agentNode(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR));
    workflow.addNode(AGENT_NAMES.AGENT_SUMMARIZE, this.agentNode(AGENT_NAMES.AGENT_SUMMARIZE));
    workflow.addNode(AGENT_NAMES.AGENT_CODE_FIXER, this.agentNode(AGENT_NAMES.AGENT_CODE_FIXER));
    workflow.addNode(GRAPH_NODE.CRITIC, this.criticNode.bind(this));
    workflow.addNode(GRAPH_NODE.HUMAN_APPROVAL, this.humanApprovalNode.bind(this));

    // Entry point
    workflow.addEdge(START, GRAPH_NODE.SUPERVISOR as any);

    // Supervisor routes to agents
    workflow.addConditionalEdges(GRAPH_NODE.SUPERVISOR as any, (state: AgentState) => {
      // Stop immediately if pipeline is terminal
      if (state.status === PIPELINE_STATUS.COMPLETED || state.status === PIPELINE_STATUS.FAILED) {
        return END;
      }
      // Handle undefined or unknown destinations gracefully
      const agent = state.currentAgent;
      if (!agent || agent === END) return END;
      return agent;
    }, {
      [GRAPH_NODE.SUPERVISOR]: GRAPH_NODE.SUPERVISOR,
      [AGENT_NAMES.AGENT_ISSUE_ANALYZER]: AGENT_NAMES.AGENT_ISSUE_ANALYZER,
      [AGENT_NAMES.AGENT_COMMIT_ANALYZER]: AGENT_NAMES.AGENT_COMMIT_ANALYZER,
      [AGENT_NAMES.AGENT_TESTS_GENERATOR]: AGENT_NAMES.AGENT_TESTS_GENERATOR,
      [AGENT_NAMES.AGENT_TESTS_REVIEWER]: AGENT_NAMES.AGENT_TESTS_REVIEWER,
      [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR]: AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR,
      [AGENT_NAMES.AGENT_SUMMARIZE]: AGENT_NAMES.AGENT_SUMMARIZE,
      [AGENT_NAMES.AGENT_CODE_FIXER]: AGENT_NAMES.AGENT_CODE_FIXER,
      [GRAPH_NODE.CRITIC]: GRAPH_NODE.CRITIC,
      [GRAPH_NODE.HUMAN_APPROVAL]: GRAPH_NODE.HUMAN_APPROVAL,
      [GRAPH_NODE.RUN_TESTS]: GRAPH_NODE.RUN_TESTS,
      [END]: END,
    } as any);

    // All agents return to supervisor
    for (const agentName of [
      AGENT_NAMES.AGENT_ISSUE_ANALYZER,
      AGENT_NAMES.AGENT_COMMIT_ANALYZER,
      AGENT_NAMES.AGENT_TESTS_GENERATOR,
      AGENT_NAMES.AGENT_TESTS_REVIEWER,
      AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR,
      AGENT_NAMES.AGENT_SUMMARIZE,
      AGENT_NAMES.AGENT_CODE_FIXER,
    ] as AgentName[]) {
      workflow.addEdge(agentName as any, GRAPH_NODE.SUPERVISOR as any);
    }

    // runTests returns to supervisor
    workflow.addEdge(GRAPH_NODE.RUN_TESTS as any, GRAPH_NODE.SUPERVISOR as any);

    // Critic returns to supervisor
    workflow.addEdge(GRAPH_NODE.CRITIC as any, GRAPH_NODE.SUPERVISOR as any);

    // Human approval returns to supervisor
    workflow.addEdge(GRAPH_NODE.HUMAN_APPROVAL as any, GRAPH_NODE.SUPERVISOR as any);

    // Compile with checkpointer
    return workflow.compile({
      checkpointer: this.config.checkpointer,
      recursionLimit: 100,
    });
  }

  private async supervisorNode(state: AgentState): Promise<Partial<AgentState>> {
    // If pipeline already completed or failed, stop the graph
    if (state.status === PIPELINE_STATUS.COMPLETED || state.status === PIPELINE_STATUS.FAILED) {
      logger.info(`[AgenticGraph] Pipeline ${state.status}, stopping`);
      return { currentAgent: END as AgentName };
    }

    // Circuit breaker: check maxPipelineSteps
    if (this.stepCounter >= (state.maxPipelineSteps ?? 50)) {
      logger.error(`[AgenticGraph] Max pipeline steps (${state.maxPipelineSteps}) reached. Stopping.`);
      return { 
        status: PIPELINE_STATUS.FAILED, 
        error: `Max pipeline steps (${state.maxPipelineSteps}) reached`,
        currentAgent: CORE_AGENT_NAMES.SUPERVISOR
      };
    }
    
    // Circuit breaker: check replan limit
    if (this.replanCounter >= this.maxReplans) {
      logger.error(`[AgenticGraph] Max replans (${this.maxReplans}) reached. Stopping.`);
      return { 
        status: PIPELINE_STATUS.FAILED, 
        error: `Max replans (${this.maxReplans}) reached`,
        currentAgent: CORE_AGENT_NAMES.SUPERVISOR
      };
    }
    
    try {
      this.supervisor = new Supervisor(state);
      
      for (const [name, agent] of this.agents) {
        this.supervisor.registerAgent(name, agent);
      }

      const decision = await this.supervisor.route();
      
      // Handle terminal decisions IMMEDIATELY — do NOT go through executeDecision()
      // which mutates state in-place and causes extractStateChanges to be a no-op
      if (decision.action === ROUTING_ACTION.COMPLETE) {
        logger.success(`[Supervisor] Pipeline complete: ${decision.reason}`);
        return {
          status: PIPELINE_STATUS.COMPLETED,
          currentAgent: END as AgentName,
        };
      }
      if (decision.action === ROUTING_ACTION.FAIL) {
        logger.error(`[Supervisor] Pipeline failed: ${decision.reason}`);
        return {
          status: PIPELINE_STATUS.FAILED,
          error: decision.reason,
          currentAgent: END as AgentName,
        };
      }
      
      // Handle replan action
      if (decision.action === "replan") {
        return this.handleReplan(state, decision);
      }
      
      const newState = await this.supervisor.executeDecision(decision);
      
      // Extract changes and include planStepIndex if it was updated
      const changes = this.extractStateChanges(state, newState);
      
      // Persist planStepIndex so next supervisor invocation starts from correct step
      if (this.supervisor.currentPlanStepIndex !== undefined) {
        changes.planStepIndex = this.supervisor.currentPlanStepIndex;
      }
      
      return changes;
    } catch (err) {
      logger.error(`[AgenticGraph] Supervisor node failed: ${err}`);
      return { status: PIPELINE_STATUS.FAILED, error: `Supervisor failed: ${err}`, currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
    }
  }

  private async handleReplan(state: AgentState, decision: any): Promise<Partial<AgentState>> {
    logger.info(`[AgenticGraph] Handling replan: ${decision.reason}`);
    this.replanCounter++;
    
    // Collect critic feedback from reflection history
    const criticFeedback: CriticFeedback[] = [];
    
    for (const [agentName, reflections] of Object.entries(state.reflectionHistory)) {
      const latestReflection = reflections[reflections.length - 1];
      if (latestReflection) {
        criticFeedback.push({
          agent: agentName as AgentName,
          score: latestReflection.score,
          weaknesses: latestReflection.weaknesses,
          suggestions: latestReflection.suggestions,
          shouldRevise: latestReflection.shouldRevise,
          revisedOutput: latestReflection.revisedOutput,
        });
      }
    }
    
    // Get the failed agent from the decision or state
    const failedAgent = state.currentAgent !== CORE_AGENT_NAMES.SUPERVISOR ? state.currentAgent : undefined;
    
    // Generate revised plan
    const availableAgents = Array.from(this.agents.keys());
    const goal = state.mode === MODE.ISSUE 
      ? `Process issue #${state.issue?.number}: ${state.issue?.title}`
      : `Process commit ${state.commitDiff?.sha.slice(0,7)}`;
    
    const revisedPlan = await this.planner.generateRevisedPlan(
      goal,
      availableAgents,
      criticFeedback,
      failedAgent
    );
    
    logger.success("[AgenticGraph] Replan complete - revised master plan generated");
    
    // Return mutations (don't mutate the state parameter)
    return {
      plans: {
        ...state.plans,
        planner: revisedPlan
      },
      planStepIndex: 0,
      currentAgent: CORE_AGENT_NAMES.SUPERVISOR as AgentName,
      status: PIPELINE_STATUS.RUNNING,
    };
  }

  private agentNode(agentName: AgentName) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
      const agent = this.agents.get(agentName);
      if (!agent) {
        return { status: PIPELINE_STATUS.FAILED, error: `Agent not found: ${agentName}`, currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
      }

      metrics.startAgent(agentName);

      try {
        this.stepCounter++;
        
        // Create a safe copy of state to prevent mutation of original
        const stateCopy = this.safeStateCopy(state);
        
        // Update agent's internal state reference before running
        agent.setState(stateCopy);
        
        const newState = await agent.run(stateCopy);
        
        if (this.config.enableCritic && this.critics.has(agentName)) {
          const critic = this.critics.get(agentName)!;
          const output = newState.testContent || newState.report || newState.summary || "";
          if (output) {
            const { result, revised } = await critic.critiqueWithRevision(output, {
              goal: agent.getGoal(),
              agent: agentName,
            });
            
            if (revised && result.shouldRevise) {
              if (agentName === AGENT_NAMES.AGENT_TESTS_GENERATOR) {
                newState.testContent = revised;
                // Write verified revision to disk
                if (newState.testFilename && newState.testOutputPath) {
                  const fs = await import("node:fs");
                  const path = await import("node:path");
                  const fullPath = path.join(newState.testOutputPath, newState.testFilename);
                  const dir = path.dirname(fullPath);
                  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                  fs.writeFileSync(fullPath, revised, "utf-8");
                  logger.info(`[Graph] Critic revision written to tests/${newState.testFilename}`);
                }
              }
              else if (agentName === AGENT_NAMES.AGENT_TESTS_REVIEWER) {
                // TestsReviewer output is analysis, not test content
                // Log the revision for debugging but don't write to disk
                logger.info(`[Graph] Critic revised TestsReviewer analysis (${revised.length} chars)`);
              }
              else if (agentName === AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR) newState.report = revised;
              else if (agentName === AGENT_NAMES.AGENT_SUMMARIZE) newState.summary = revised;
            }
          }
        }

        metrics.endAgent(true);
        const changes = this.extractStateChanges(state, newState);
        return { ...changes, currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
      } catch (err) {
        metrics.endAgent(false, String(err));
        return { 
          status: PIPELINE_STATUS.FAILED, 
          error: `Agent ${agentName} failed: ${err}`,
          currentAgent: CORE_AGENT_NAMES.SUPERVISOR,
        };
      }
    };
  }

  private safeStateCopy(state: AgentState): AgentState {
    // Create a safe copy that avoids circular references
    // Only copy primitive values and explicitly serialize complex objects
    return {
      ...state,
      // Primitive/modifiable fields - safe to copy
      testFilename: state.testFilename,
      testContent: state.testContent,
      testResult: state.testResult ? { ...state.testResult } : undefined,
      report: state.report,
      reportPath: state.reportPath,
      summary: state.summary,
      prUrl: state.prUrl,
      branchName: state.branchName,
      retries: state.retries,
      retryHistory: state.retryHistory.map(r => ({ ...r })),
      stepHistory: state.stepHistory.map(s => ({ ...s })),
      status: state.status,
      error: state.error,
      targetCodeIssues: state.targetCodeIssues?.map(i => ({ ...i })),
      codeFixRetries: state.codeFixRetries,
      maxCodeFixRetries: state.maxCodeFixRetries,
      // Preserve shared coordination data (deep copy to avoid cross-agent mutation)
      plans: Object.fromEntries(
        Object.entries(state.plans).map(([k, v]) => [k, { ...v, steps: v.steps.map(s => ({ ...s })) }])
      ) as Record<AgentName, AgentPlan>,
      messages: state.messages.map(m => ({ ...m })),
      memory: state.memory.map(m => ({ ...m })),
      reflectionHistory: Object.fromEntries(
        Object.entries(state.reflectionHistory).map(([k, v]) => [k, v.map(r => ({ ...r }))])
      ) as Record<AgentName, ReflectionResult[]>,
      humanApprovals: state.humanApprovals.map(a => ({ ...a })),
      agentStatus: { ...state.agentStatus },
      // Preserve read-only fields
      mode: state.mode,
      runId: state.runId,
      issue: state.issue,
      commitDiff: state.commitDiff,
      agentConfig: state.agentConfig,
      reader: state.reader,
      testReader: state.testReader,
      runner: state.runner,
      git: state.git,
      githubClient: state.githubClient,
      provider: state.provider,
      codebasePath: state.codebasePath,
      testProjectPath: state.testProjectPath,
      testOutputPath: state.testOutputPath,
      projectName: state.projectName,
      testReviewMaxRetries: state.testReviewMaxRetries,
      maxIterations: state.maxIterations,
      maxPipelineSteps: state.maxPipelineSteps,
      commitAutoApprove: state.commitAutoApprove,
      baseBranch: state.baseBranch,
      planStepIndex: state.planStepIndex,
      projectContext: state.projectContext ? { ...state.projectContext } : undefined,
      issueAnalysis: state.issueAnalysis ? { ...state.issueAnalysis } : undefined,
      commitAnalysis: state.commitAnalysis ? { ...state.commitAnalysis } : undefined,
      currentAgent: state.currentAgent,
    };
  }

  private async criticNode(state: AgentState): Promise<Partial<AgentState>> {
    const lastAgent = state.currentAgent;
    const critic = this.critics.get(lastAgent);
    
    if (!critic) {
      return { currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
    }

    const output = state.testContent || state.report || state.summary || "";
    if (!output) {
      return { currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
    }

    try {
      const { result, revised } = await critic.critiqueWithRevision(output, {
        goal: this.agents.get(lastAgent)?.getGoal() || "",
        agent: lastAgent,
      });

      if (revised && result.shouldRevise) {
        const updates: Partial<AgentState> = { currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
        if (lastAgent === AGENT_NAMES.AGENT_TESTS_GENERATOR) updates.testContent = revised;
        else if (lastAgent === AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR) updates.report = revised;
        else if (lastAgent === AGENT_NAMES.AGENT_SUMMARIZE) updates.summary = revised;
        return updates;
      }
    } catch (err) {
      logger.warn(`[AgenticGraph] Critic node failed: ${err}`);
    }

    return { currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
  }

  private async humanApprovalNode(state: AgentState): Promise<Partial<AgentState>> {
    const pending = state.humanApprovals.find(a => !a.resolved);
    if (!pending) {
      return { currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
    }

    logger.info(`[HumanApproval] Interrupting for approval: ${pending.title}`);
    
    // Use LangGraph's native interrupt for human-in-the-loop
    const resolution = await interrupt({
      type: "approval",
      requestId: pending.id,
      agent: pending.agent,
      title: pending.title,
      description: pending.description,
      options: pending.options.map(o => o.value),
    });

    // Update the approval with resolution
    const updatedApprovals = state.humanApprovals.map(a => 
      a.id === pending.id ? { ...a, resolved: true, resolution } : a
    );

    if (resolution === "approve") {
      return { status: PIPELINE_STATUS.RUNNING, currentAgent: CORE_AGENT_NAMES.SUPERVISOR, humanApprovals: updatedApprovals };
    }

    return { status: PIPELINE_STATUS.FAILED, error: `Human rejected: ${pending.title}`, currentAgent: CORE_AGENT_NAMES.SUPERVISOR, humanApprovals: updatedApprovals };
  }

  private async runTestsNode(state: AgentState): Promise<Partial<AgentState>> {
    const testFilename = state.testFilename;
    if (!testFilename) {
      logger.error(`[runTests] No test filename in state`);
      return { status: PIPELINE_STATUS.FAILED, error: "No test filename", currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
    }

    logger.info(`[runTests] Running tests: ${testFilename}`);

    try {
      const runner = state.runner;
      if (!runner) {
        logger.error(`[runTests] No test runner available`);
        return { status: PIPELINE_STATUS.FAILED, error: "No test runner available", currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
      }

      const testResult = runner.run(testFilename);
      state.testResult = testResult;

      if (testResult.success) {
        logger.success(`[runTests] Tests passed: ${testResult.passed}/${testResult.total}`);
      } else {
        logger.warn(`[runTests] Tests failed: ${testResult.passed} passed, ${testResult.failed} failed`);
        if (testResult.errors.length > 0) {
          for (let i = 0; i < testResult.errors.length; i++) {
            logger.error(`  ${i + 1}. ${testResult.errors[i].slice(0, 300)}`);
          }
        }
      }

      if (testResult.htmlReportPath) {
        logger.info(`[runTests] HTML report: ${testResult.htmlReportPath}`);
      }

      return { testResult, currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
    } catch (err) {
      logger.error(`[runTests] Test execution failed: ${err}`);
      return { status: PIPELINE_STATUS.FAILED, error: `Test execution failed: ${err}`, currentAgent: CORE_AGENT_NAMES.SUPERVISOR };
    }
  }

  private extractStateChanges(oldState: AgentState, newState: AgentState): Partial<AgentState> {
    const changes: Partial<AgentState> = {};
    
    const keys: (keyof AgentState)[] = [
      "issueAnalysis", "commitAnalysis", "testFilename", "testContent", "testResult",
      "report", "reportPath", "summary", "prUrl", "branchName", "retries",
      "retryHistory", "currentAgent", "agentStatus", "plans", "messages",
      "memory", "reflectionHistory", "humanApprovals", "stepHistory", "status", "error",
      "projectContext", "targetCodeIssues", "codeFixRetries", "maxCodeFixRetries",
    ];

    for (const key of keys) {
      try {
        if (!this.deepEqual(oldState[key], newState[key])) {
          (changes as any)[key] = newState[key];
        }
      } catch {
        // If comparison fails (e.g., circular refs), assume changed
        (changes as any)[key] = newState[key];
      }
    }

    return changes;
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    return this.deepEqualWithVisited(a, b, new WeakSet());
  }

  private deepEqualWithVisited(a: unknown, b: unknown, visited: WeakSet<object>): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== "object" || typeof b !== "object") return a === b;
    
    // Check for circular references
    if (visited.has(a as object) || visited.has(b as object)) {
      return a === b;
    }
    
    visited.add(a as object);
    visited.add(b as object);
    
    try {
      const arrA = Array.isArray(a);
      const arrB = Array.isArray(b);
      if (arrA !== arrB) return false;
      
      if (arrA) {
        const arrA_ = a as unknown[];
        const arrB_ = b as unknown[];
        if (arrA_.length !== arrB_.length) return false;
        return arrA_.every((val, idx) => this.deepEqualWithVisited(val, arrB_[idx], visited));
      }
      
      const keysA = Object.keys(a as Record<string, unknown>);
      const keysB = Object.keys(b as Record<string, unknown>);
      if (keysA.length !== keysB.length) return false;
      
      const objA = a as Record<string, unknown>;
      const objB = b as Record<string, unknown>;
      return keysA.every(key => this.deepEqualWithVisited(objA[key], objB[key], visited));
    } catch {
      // Fallback to reference equality on any error (e.g., circular refs, getters throwing)
      return a === b;
    } finally {
      visited.delete(a as object);
      visited.delete(b as object);
    }
  }

  registerAgent(name: AgentName, agent: BaseAgent): void {
    this.agents.set(name, agent);
  }

  registerCritic(agentName: AgentName, critic: AgentCritic): void {
    this.critics.set(agentName, critic);
  }

  async initialize(): Promise<void> {
    try {
      await this.memoryStore.initialize();
      logger.success(`[AgenticGraph] Memory store initialized (${this.config.memoryType})`);
    } catch (err) {
      logger.error(`[AgenticGraph] Memory store initialization failed: ${err}`);
      logger.warn(`[AgenticGraph] Continuing without persistent memory — memories will not be stored`);
    }
    logger.success("[AgenticGraph] Initialized with native LangGraph features");
  }

  async invoke(initialState: AgentState, config?: { configurable?: { thread_id: string } }): Promise<AgentState> {
    logger.info(`[AgenticGraph] Starting run: ${initialState.runId}`);
    
    // Attach memory store to state for agent access
    initialState.memoryStore = this.memoryStore;
    // Attach message bus to state for inter-agent communication
    initialState.messageBus = this.getMessageBus();
    
    // Subscribe to all agent events for logging
    this.messageBus.subscribeToBroadcast((msg) => {
      const payload = msg.payload as Record<string, unknown>;
      logger.info(`[MessageBus] ${msg.from} → ${msg.to}: ${msg.type} | event=${payload?.event ?? "unknown"} ${JSON.stringify(payload)}`);
    });
    
    // Generate initial master plan
    this.planner = new AdvancedPlanner(initialState);
    const availableAgents = Array.from(this.agents.keys());
    const masterPlan = await this.planner.generateMasterPlan(
      initialState.mode === MODE.ISSUE 
        ? `Process issue #${initialState.issue?.number}: ${initialState.issue?.title}`
        : `Process commit ${initialState.commitDiff?.sha.slice(0,7)}`,
      availableAgents
    );
    
    // Store plan in state
    initialState.plans = { 
      ...initialState.plans,
      planner: masterPlan 
    } as Record<AgentName, AgentPlan>;
    
    // Use thread_id from runId for checkpointing
    const threadId = config?.configurable?.thread_id || initialState.runId;
    
    return this.graph.invoke(initialState, { configurable: { thread_id: threadId } });
  }

  async stream(initialState: AgentState, config?: { configurable?: { thread_id: string } }) {
    const threadId = config?.configurable?.thread_id || initialState.runId;
    return this.graph.stream(initialState, { configurable: { thread_id: threadId } });
  }

  // Resume from interrupt (human approval)
  async resumeAfterApproval(threadId: string, resolution: string): Promise<AgentState> {
    return this.graph.invoke(new Command({ resume: resolution }), { configurable: { thread_id: threadId } });
  }

  getSupervisor(): Supervisor {
    return this.supervisor;
  }

  getMemoryStore(): MemoryStore {
    return this.memoryStore;
  }

  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  getCompiledGraph() {
    return this.graph;
  }
}

export function createAgenticGraph(config?: Partial<AgenticGraphConfig>): AgenticGraph {
  return new AgenticGraph(config);
}