import type { AgentConfig } from "../providers/types.js";
import type { GitHubIssue, CommitDiff } from "../github/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner, TestResult } from "../test_runner/playwright.js";
import type { GitBranch } from "../github/git_operations.js";
import type { GitHubClient } from "../github/client.js";
import type { ProviderInterface } from "../providers/types.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import {
  CORE_AGENT_NAMES,
  AGENT_STATUS,
  RISK_LEVEL,
  APPROVED_BY,
  MESSAGE_TYPE,
  APPROVAL_TYPE,
  MODE,
  PIPELINE_STATUS,
} from "../utils/constants.js";

export type AgentName =
  | typeof CORE_AGENT_NAMES.SUPERVISOR
  | typeof CORE_AGENT_NAMES.CRITIC
  | typeof CORE_AGENT_NAMES.PLANNER
  | (typeof AGENT_NAMES)[keyof typeof AGENT_NAMES];

export type AgentStatus =
  | typeof AGENT_STATUS.IDLE
  | typeof AGENT_STATUS.PLANNING
  | typeof AGENT_STATUS.EXECUTING
  | typeof AGENT_STATUS.REFLECTING
  | typeof AGENT_STATUS.AWAITING_APPROVAL
  | typeof AGENT_STATUS.COMPLETED
  | typeof AGENT_STATUS.FAILED;

export interface PlanStep {
  id: string;
  agent?: AgentName;
  tool: string;
  args: Record<string, unknown>;
  expectedOutcome: string;
  reasoning: string;
  dependsOn?: string[];
  canRunParallel?: boolean;
}

export interface AgentPlan {
  agent: AgentName;
  goal: string;
  steps: PlanStep[];
  estimatedIterations: number;
  riskLevel: typeof RISK_LEVEL.LOW | typeof RISK_LEVEL.MEDIUM | typeof RISK_LEVEL.HIGH;
  createdAt: number;
  approved?: boolean;
  approvedBy?: typeof APPROVED_BY.HUMAN | typeof APPROVED_BY.SUPERVISOR;
  parallelGroups?: string[][];
}

export interface AgentMessage {
  id: string;
  from: AgentName;
  to: AgentName | typeof MESSAGE_TYPE.BROADCAST;
  type: typeof MESSAGE_TYPE.REQUEST | typeof MESSAGE_TYPE.RESPONSE | typeof MESSAGE_TYPE.NOTIFICATION | typeof MESSAGE_TYPE.DELEGATION;
  payload: unknown;
  timestamp: number;
  correlationId?: string;
}

export interface MemoryEntry {
  id: string;
  type: "code_pattern" | "test_pattern" | "issue_solution" | "error_fix" | "project_context" | "decision" | "lesson_learned";
  embedding?: number[];
  content: string;
  metadata: {
    project: string;
    agent: AgentName;
    success: boolean;
    tags: string[];
    timestamp: number;
    relatedIssue?: number;
    relatedCommit?: string;
    source?: string;
  };
}

export interface ReflectionResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  shouldRevise: boolean;
  revisedOutput?: string;
}

export interface HumanApprovalRequest {
  id: string;
  agent: AgentName;
  type: typeof APPROVAL_TYPE.PLAN | typeof APPROVAL_TYPE.TEST_GENERATION | typeof APPROVAL_TYPE.COMMIT_PUSH | typeof APPROVAL_TYPE.PR_CREATION | typeof APPROVAL_TYPE.ARCHITECTURE_DECISION;
  title: string;
  description: string;
  data: unknown;
  options: { label: string; value: string }[];
  defaultOption?: string;
  timeoutMs?: number;
  createdAt: number;
  resolved?: boolean;
  resolution?: string;
}

export interface AgentState {
  mode: typeof MODE.ISSUE | typeof MODE.COMMIT;
  runId: string;
  
  issue?: GitHubIssue;
  commitDiff?: CommitDiff;
  
  agentConfig: AgentConfig;
  reader: CodebaseReader;
  testReader: CodebaseReader;
  runner: PlaywrightRunner;
  git: GitBranch;
  githubClient?: GitHubClient;
  provider?: ProviderInterface;
  
  memoryStore?: import("./memory.js").MemoryStore;
  messageBus?: import("./message_bus.js").MessageBus;
  
  codebasePath: string;
  testProjectPath: string;
  testOutputPath: string;
  projectName: string;
  
  maxRetries: number;
  maxIterations: number;
  maxPipelineSteps: number;
  commitAutoApprove: boolean;
  retries: number;
  playwrightWorkers: number;
  
  planStepIndex: number;
  
  baseBranch?: string;
  branchName?: string;
  apiBaseUrl?: string;
  
  projectContext?: {
    framework: string;
    testRunner: string;
    dependencies: Record<string, string>;
    dataModels: string;
    apiRoutes: string[];
    projectStructure: string;
    existingTestPatterns: string;
    testUtils: string;
  };
  
  issueAnalysis?: {
    summary: string;
    functionality_to_test: string[];
    relevant_files: string[];
    test_scenarios: Array<{
      name: string;
      type: "positive" | "negative";
      description: string;
      acceptance_criterion?: string;
    }>;
    edge_cases: string[];
    api_endpoints: string[];
    role_checks: string[];
    needs_tests: boolean;
  };
  
  commitAnalysis?: {
    needsTests: boolean;
    reason: string;
    scope: string | null;
  };
  
  testFilename?: string;
  testContent?: string;
  testResult?: TestResult;
  report?: string;
  reportPath?: string;
  summary?: string;
  prUrl?: string;
  
  retryHistory: Array<{
    attempt: number;
    errors: string[];
    analysis?: string;
  }>;
  
  currentAgent: AgentName;
  agentStatus: Record<AgentName, AgentStatus> & { parallelQueue?: AgentName[] };
  
  plans: Record<AgentName, AgentPlan>;
  messages: AgentMessage[];
  memory: MemoryEntry[];
  
  reflectionHistory: Record<AgentName, ReflectionResult[]>;
  
  humanApprovals: HumanApprovalRequest[];
  
  stepHistory: Array<{
    name: string;
    timestamp: number;
    agent: AgentName;
    output: string;
    decision: string;
  }>;
  
  status: typeof PIPELINE_STATUS.RUNNING | typeof PIPELINE_STATUS.COMPLETED | typeof PIPELINE_STATUS.FAILED | typeof PIPELINE_STATUS.SKIPPED | typeof PIPELINE_STATUS.AWAITING_HUMAN;
  error?: string;
}

export function createInitialAgentState(input: {
  mode: typeof MODE.ISSUE | typeof MODE.COMMIT;
  runId: string;
  issue?: GitHubIssue;
  commitDiff?: CommitDiff;
  agentConfig: AgentConfig;
  reader: CodebaseReader;
  testReader: CodebaseReader;
  runner: PlaywrightRunner;
  git: GitBranch;
  githubClient?: GitHubClient;
  provider?: ProviderInterface;
  codebasePath: string;
  testProjectPath: string;
  testOutputPath: string;
  projectName: string;
  maxRetries: number;
  maxIterations: number;
  maxPipelineSteps: number;
  commitAutoApprove?: boolean;
  baseBranch: string;
  branchName: string;
  playwrightWorkers?: number;
  apiBaseUrl?: string;
}): AgentState {
  const agentNames: AgentName[] = [
    CORE_AGENT_NAMES.SUPERVISOR,
    CORE_AGENT_NAMES.CRITIC,
    CORE_AGENT_NAMES.PLANNER,
    AGENT_NAMES.AGENT_ISSUE_ANALYZER,
    AGENT_NAMES.AGENT_COMMIT_ANALYZER,
    AGENT_NAMES.AGENT_TESTS_GENERATOR,
    AGENT_NAMES.AGENT_TESTS_REVIEWER,
    AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR,
    AGENT_NAMES.AGENT_SUMMARIZE,
  ];
  
  return {
    mode: input.mode,
    runId: input.runId,
    issue: input.issue,
    commitDiff: input.commitDiff,
    agentConfig: input.agentConfig,
    reader: input.reader,
    testReader: input.testReader,
    runner: input.runner,
    git: input.git,
    githubClient: input.githubClient,
    provider: input.provider,
    codebasePath: input.codebasePath,
    testProjectPath: input.testProjectPath,
    testOutputPath: input.testOutputPath,
    projectName: input.projectName,
    maxRetries: input.maxRetries,
    maxIterations: input.maxIterations,
    maxPipelineSteps: input.maxPipelineSteps,
    commitAutoApprove: input.commitAutoApprove ?? true,
    retries: 0,
    playwrightWorkers: input.playwrightWorkers ?? 6,
    planStepIndex: 0,
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    apiBaseUrl: input.apiBaseUrl,
    retryHistory: [],
    currentAgent: CORE_AGENT_NAMES.SUPERVISOR,
    agentStatus: agentNames.reduce((acc, name) => ({ ...acc, [name]: AGENT_STATUS.IDLE }), {} as Record<AgentName, AgentStatus> & { parallelQueue: [] }),
    plans: {} as Record<AgentName, AgentPlan>,
    messages: [],
    memory: [],
    reflectionHistory: {} as Record<AgentName, ReflectionResult[]>,
    humanApprovals: [],
    stepHistory: [],
    status: PIPELINE_STATUS.RUNNING,
  };
}