import type { AgentState } from "./state.js";

export interface ProjectContext {
  framework: string;
  testRunner: string;
  dependencies: Record<string, string>;
  dataModels: string;
  apiRoutes: string[];
  projectStructure: string;
  existingTestPatterns: string;
  testUtils: string;
}

export interface SharedContext {
  mode: "issue" | "commit";
  issue?: AgentState["issue"];
  commitDiff?: AgentState["commitDiff"];
  agentConfig: AgentState["agentConfig"];
  reader: AgentState["reader"];
  testReader: AgentState["testReader"];
  runner: AgentState["runner"];
  git: AgentState["git"];
  githubClient?: AgentState["githubClient"];
  codebasePath: string;
  testProjectPath: string;
  testOutputPath: string;
  projectName: string;
  testReviewMaxRetries: number;
  maxIterations: number;
  maxPipelineSteps: number;
  commitAutoApprove: boolean;
  retries: number;
  status: AgentState["status"];
  issueAnalysis?: AgentState["issueAnalysis"];
  commitAnalysis?: AgentState["commitAnalysis"];
  testFilename?: string;
  testContent?: string;
  testResult?: AgentState["testResult"];
  report?: string;
  reportPath?: string;
  summary?: string;
  prUrl?: string;
  branchName?: string;
  baseBranch?: string;
  projectContext?: ProjectContext;
  retryHistory: AgentState["retryHistory"];
  stepHistory: AgentState["stepHistory"];
}

export function toSharedContext(state: AgentState): SharedContext {
  return {
    mode: state.mode,
    issue: state.issue,
    commitDiff: state.commitDiff,
    agentConfig: state.agentConfig,
    reader: state.reader,
    testReader: state.testReader,
    runner: state.runner,
    git: state.git,
    githubClient: state.githubClient,
    codebasePath: state.codebasePath,
    testProjectPath: state.testProjectPath,
    testOutputPath: state.testOutputPath,
    projectName: state.projectName,
    testReviewMaxRetries: state.testReviewMaxRetries,
    maxIterations: state.maxIterations,
    maxPipelineSteps: state.maxPipelineSteps,
    commitAutoApprove: state.commitAutoApprove,
    retries: state.retries,
    status: state.status,
    issueAnalysis: state.issueAnalysis,
    commitAnalysis: state.commitAnalysis,
    testFilename: state.testFilename,
    testContent: state.testContent,
    testResult: state.testResult,
    report: state.report,
    reportPath: state.reportPath,
    summary: state.summary,
    prUrl: state.prUrl,
    branchName: state.branchName,
    baseBranch: state.baseBranch,
    projectContext: state.projectContext,
    retryHistory: state.retryHistory,
    stepHistory: state.stepHistory,
  };
}