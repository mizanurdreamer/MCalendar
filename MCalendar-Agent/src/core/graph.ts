import { StateGraph, Annotation, START, END, Send, MemorySaver, BaseCheckpointSaver } from "@langchain/langgraph";
import type { AgentState, AgentName, AgentPlan } from "./state.js";
import { Supervisor } from "./supervisor.js";
import { BaseAgent } from "./base_agent.js";
import { AgentCritic } from "./agent_critic.js";
import { AdvancedPlanner, type CriticFeedback } from "./planner.js";
import { createMemoryStore, type MemoryStore } from "./memory.js";
import { MessageBus } from "./message_bus.js";
import { logger } from "../utils/logger.js";
import { Command, interrupt } from "@langchain/langgraph";
import { AGENT_NAMES } from "../utils/agent_names.js";

export interface AgenticGraphConfig {
  memoryType: "local";
  enableCritic: boolean;
  enableHumanGates: boolean;
  maxParallelAgents: number;
  checkpointer?: BaseCheckpointSaver;
}

const AgentStateAnnotation = Annotation.Root({
  mode: Annotation<"issue" | "commit">(),
  runId: Annotation<string>(),
  issue: Annotation<any>(),
  commitDiff: Annotation<any>(),
  agentConfig: Annotation<any>(),
  reader: Annotation<any>(),
  testReader: Annotation<any>(),
  runner: Annotation<any>(),
  git: Annotation<any>(),
  githubClient: Annotation<any>(),
  provider: Annotation<any>(),
  codebasePath: Annotation<string>(),
  testProjectPath: Annotation<string>(),
  testOutputPath: Annotation<string>(),
  projectName: Annotation<string>(),
  maxRetries: Annotation<number>(),
  maxIterations: Annotation<number>(),
  maxPipelineSteps: Annotation<number>(),
  commitAutoApprove: Annotation<boolean>(),
  retries: Annotation<number>(),
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
  status: Annotation<"running" | "completed" | "failed" | "skipped" | "awaiting_human">(),
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

  constructor(config: Partial<AgenticGraphConfig> = {}) {
    this.config = {
      memoryType: "local",
      enableCritic: true,
      enableHumanGates: true,
      maxParallelAgents: 3,
      checkpointer: new MemorySaver(),
      ...config,
    };
    
    this.memoryStore = createMemoryStore(this.config.memoryType);
    this.messageBus = new MessageBus();
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    const workflow = new StateGraph(AgentStateAnnotation);

    // Core nodes
    workflow.addNode("supervisor", this.supervisorNode.bind(this));
    workflow.addNode(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.agentNode(AGENT_NAMES.AGENT_ISSUE_ANALYZER));
    workflow.addNode(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.agentNode(AGENT_NAMES.AGENT_COMMIT_ANALYZER));
    workflow.addNode(AGENT_NAMES.AGENT_TESTS_GENERATOR, this.agentNode(AGENT_NAMES.AGENT_TESTS_GENERATOR));
    workflow.addNode(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.agentNode(AGENT_NAMES.AGENT_TESTS_REVIEWER));
    workflow.addNode(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, this.agentNode(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR));
    workflow.addNode(AGENT_NAMES.AGENT_SUMMARIZE, this.agentNode(AGENT_NAMES.AGENT_SUMMARIZE));
    workflow.addNode("critic", this.criticNode.bind(this));
    workflow.addNode("human_approval", this.humanApprovalNode.bind(this));

    // Entry point
    workflow.addEdge(START, "supervisor" as any);

    // Supervisor routes to agents
    workflow.addConditionalEdges("supervisor" as any, (state: AgentState) => state.currentAgent, {
      [AGENT_NAMES.AGENT_ISSUE_ANALYZER]: AGENT_NAMES.AGENT_ISSUE_ANALYZER,
      [AGENT_NAMES.AGENT_COMMIT_ANALYZER]: AGENT_NAMES.AGENT_COMMIT_ANALYZER,
      [AGENT_NAMES.AGENT_TESTS_GENERATOR]: AGENT_NAMES.AGENT_TESTS_GENERATOR,
      [AGENT_NAMES.AGENT_TESTS_REVIEWER]: AGENT_NAMES.AGENT_TESTS_REVIEWER,
      [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR]: AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR,
      [AGENT_NAMES.AGENT_SUMMARIZE]: AGENT_NAMES.AGENT_SUMMARIZE,
      critic: "critic",
      human_approval: "human_approval",
      [END]: END,
    } as any);

    // All agents return to supervisor
    for (const agentName of [
      AGENT_NAMES.AGENT_ISSUE_ANALYZER, 
      AGENT_NAMES.AGENT_COMMIT_ANALYZER, 
      AGENT_NAMES.AGENT_TESTS_GENERATOR, 
      AGENT_NAMES.AGENT_TESTS_REVIEWER, 
      AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, 
      AGENT_NAMES.AGENT_SUMMARIZE
    ] as AgentName[]) {
      workflow.addEdge(agentName as any, "supervisor" as any);
    }

    // Critic returns to supervisor
    workflow.addEdge("critic" as any, "supervisor" as any);

    // Human approval returns to supervisor
    workflow.addEdge("human_approval" as any, "supervisor" as any);

    // Compile with checkpointer
    return workflow.compile({
      checkpointer: this.config.checkpointer,
    });
  }

  private async supervisorNode(state: AgentState): Promise<Partial<AgentState>> {
    this.supervisor = new Supervisor(state);
    
    for (const [name, agent] of this.agents) {
      this.supervisor.registerAgent(name, agent);
    }

    const decision = await this.supervisor.route();
    
    // Handle replan action
    if (decision.action === "replan") {
      return this.handleReplan(state, decision);
    }
    
    const newState = await this.supervisor.executeDecision(decision);
    
    return this.extractStateChanges(state, newState);
  }

  private async handleReplan(state: AgentState, decision: any): Promise<Partial<AgentState>> {
    logger.info(`[AgenticGraph] Handling replan: ${decision.reason}`);
    
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
    const failedAgent = state.currentAgent !== "supervisor" ? state.currentAgent : undefined;
    
    // Generate revised plan
    const availableAgents = Array.from(this.agents.keys());
    const goal = state.mode === "issue" 
      ? `Process issue #${state.issue?.number}: ${state.issue?.title}`
      : `Process commit ${state.commitDiff?.sha.slice(0,7)}`;
    
    const revisedPlan = await this.planner.generateRevisedPlan(
      goal,
      availableAgents,
      criticFeedback,
      failedAgent
    );
    
    // Update state with revised plan
    state.plans = {
      ...state.plans,
      planner: revisedPlan
    };
    
    // Reset plan step index
    state.planStepIndex = 0;
    
    // Reset current agent to supervisor to restart with new plan
    state.currentAgent = "supervisor";
    state.status = "running";
    
    logger.success("[AgenticGraph] Replan complete - revised master plan generated");
    
    return this.extractStateChanges(state, state);
  }

  private agentNode(agentName: AgentName) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
      const agent = this.agents.get(agentName);
      if (!agent) {
        return { status: "failed", error: `Agent not found: ${agentName}`, currentAgent: "supervisor" };
      }

      try {
        this.stepCounter++;
        const newState = await agent.run();
        
        if (this.config.enableCritic && this.critics.has(agentName)) {
          const critic = this.critics.get(agentName)!;
          const output = newState.testContent || newState.report || newState.summary || "";
          if (output) {
            const { result, revised } = await critic.critiqueWithRevision(output, {
              goal: agent.getGoal(),
              agent: agentName,
            });
            
            if (revised && result.shouldRevise) {
              if (agentName === AGENT_NAMES.AGENT_TESTS_GENERATOR) newState.testContent = revised;
              else if (agentName === AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR) newState.report = revised;
              else if (agentName === AGENT_NAMES.AGENT_SUMMARIZE) newState.summary = revised;
            }
          }
        }

        return this.extractStateChanges(state, newState);
      } catch (err) {
        return { 
          status: "failed", 
          error: `Agent ${agentName} failed: ${err}`,
          currentAgent: "supervisor",
        };
      }
    };
  }

  private async criticNode(state: AgentState): Promise<Partial<AgentState>> {
    const lastAgent = state.currentAgent;
    const critic = this.critics.get(lastAgent);
    
    if (!critic) {
      return { currentAgent: "supervisor" };
    }

    const output = state.testContent || state.report || state.summary || "";
    if (!output) {
      return { currentAgent: "supervisor" };
    }

    const { result, revised } = await critic.critiqueWithRevision(output, {
      goal: this.agents.get(lastAgent)?.getGoal() || "",
      agent: lastAgent,
    });

    if (revised && result.shouldRevise) {
      const updates: Partial<AgentState> = { currentAgent: "supervisor" };
      if (lastAgent === AGENT_NAMES.AGENT_TESTS_GENERATOR) updates.testContent = revised;
      else if (lastAgent === AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR) updates.report = revised;
      else if (lastAgent === AGENT_NAMES.AGENT_SUMMARIZE) updates.summary = revised;
      return updates;
    }

    return { currentAgent: "supervisor" };
  }

  private async humanApprovalNode(state: AgentState): Promise<Partial<AgentState>> {
    const pending = state.humanApprovals.find(a => !a.resolved);
    if (!pending) {
      return { currentAgent: "supervisor" };
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
      return { status: "running", currentAgent: "supervisor", humanApprovals: updatedApprovals };
    }

    return { status: "failed", error: `Human rejected: ${pending.title}`, currentAgent: "supervisor", humanApprovals: updatedApprovals };
  }

  private extractStateChanges(oldState: AgentState, newState: AgentState): Partial<AgentState> {
    const changes: Partial<AgentState> = {};
    
    const keys: (keyof AgentState)[] = [
      "issueAnalysis", "commitAnalysis", "testFilename", "testContent", "testResult",
      "report", "reportPath", "summary", "prUrl", "branchName", "retries",
      "retryHistory", "currentAgent", "agentStatus", "plans", "messages",
      "memory", "reflectionHistory", "humanApprovals", "stepHistory", "status", "error",
      "projectContext",
    ];

    for (const key of keys) {
      if (!this.deepEqual(oldState[key], newState[key])) {
        (changes as any)[key] = newState[key];
      }
    }

    return changes;
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== "object" || typeof b !== "object") return a === b;
    
    const arrA = Array.isArray(a);
    const arrB = Array.isArray(b);
    if (arrA !== arrB) return false;
    
    if (arrA) {
      const arrA_ = a as unknown[];
      const arrB_ = b as unknown[];
      if (arrA_.length !== arrB_.length) return false;
      return arrA_.every((val, idx) => this.deepEqual(val, arrB_[idx]));
    }
    
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    return keysA.every(key => this.deepEqual(objA[key], objB[key]));
  }

  registerAgent(name: AgentName, agent: BaseAgent): void {
    this.agents.set(name, agent);
  }

  registerCritic(agentName: AgentName, critic: AgentCritic): void {
    this.critics.set(agentName, critic);
  }

  async initialize(): Promise<void> {
    await this.memoryStore.initialize();
    logger.success("[AgenticGraph] Initialized with native LangGraph features");
  }

  async invoke(initialState: AgentState, config?: { configurable?: { thread_id: string } }): Promise<AgentState> {
    logger.info(`[AgenticGraph] Starting run: ${initialState.runId}`);
    
    // Attach memory store to state for agent access
    initialState.memoryStore = this.memoryStore;
    // Attach message bus to state for inter-agent communication
    initialState.messageBus = this.getMessageBus();
    
    // Generate initial master plan
    this.planner = new AdvancedPlanner(initialState);
    const availableAgents = Array.from(this.agents.keys());
    const masterPlan = await this.planner.generateMasterPlan(
      initialState.mode === "issue" 
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