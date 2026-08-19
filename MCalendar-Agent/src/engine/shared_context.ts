import type { AgentConfig } from "../providers/types.js";
import type { GitHubIssue, CommitDiff } from "../github/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner, TestResult } from "../test_runner/playwright.js";
import type { GitBranch } from "../github/git_operations.js";
import type { GitHubClient } from "../github/client.js";

export interface TestScenario {
  name: string;
  type: "positive" | "negative";
  description: string;
  acceptance_criterion?: string;
}

export interface IssueAnalysis {
  summary: string;
  functionality_to_test: string[];
  relevant_files: string[];
  test_scenarios: TestScenario[];
  edge_cases: string[];
  api_endpoints: string[];
  role_checks: string[];
  needs_tests: boolean;
}

export interface CommitAnalysis {
  needsTests: boolean;
  reason: string;
  scope: string | null;
}

export interface StepRecord {
  name: string;
  timestamp: number;
  agent?: string;
  output: string;
  decision: string;
}

export type StepDecision =
  | { action: "next" }
  | { action: "goto"; step: string }
  | { action: "retry"; step: string; reason: string }
  | { action: "stop"; reason: string }
  | { action: "done" };

export type StepFunction = (ctx: SharedContext) => Promise<StepDecision>;

export interface StepDefinition {
  name: string;
  run: StepFunction;
  condition?: (ctx: SharedContext) => boolean;
}

export interface SharedContext {
  mode: "issue" | "commit";
  issue?: GitHubIssue;
  commitDiff?: CommitDiff;

  agentConfig: AgentConfig;
  reader: CodebaseReader;
  testReader: CodebaseReader;
  runner: PlaywrightRunner;
  git: GitBranch;
  githubClient?: GitHubClient;

  codebasePath: string;
  testProjectPath: string;
  testOutputPath: string;
  projectName: string;

  maxRetries: number;
  maxIterations: number;
  retries: number;
  status: "running" | "completed" | "failed" | "skipped";

  issueAnalysis?: IssueAnalysis;
  commitAnalysis?: CommitAnalysis;
  testFilename?: string;
  testContent?: string;
  testResult?: TestResult;
  report?: string;
  summary?: string;

  branchName?: string;
  baseBranch?: string;

  stepHistory: StepRecord[];
}

export function createSharedContext(input: {
  mode: "issue" | "commit";
  issue?: GitHubIssue;
  commitDiff?: CommitDiff;
  agentConfig: AgentConfig;
  reader: CodebaseReader;
  testReader: CodebaseReader;
  runner: PlaywrightRunner;
  git: GitBranch;
  githubClient?: GitHubClient;
  codebasePath: string;
  testProjectPath: string;
  testOutputPath: string;
  projectName: string;
  maxRetries: number;
  maxIterations: number;
  baseBranch: string;
  branchName: string;
}): SharedContext {
  return {
    mode: input.mode,
    issue: input.issue,
    commitDiff: input.commitDiff,
    agentConfig: input.agentConfig,
    reader: input.reader,
    testReader: input.testReader,
    runner: input.runner,
    git: input.git,
    githubClient: input.githubClient,
    codebasePath: input.codebasePath,
    testProjectPath: input.testProjectPath,
    testOutputPath: input.testOutputPath,
    projectName: input.projectName,
    maxRetries: input.maxRetries,
    maxIterations: input.maxIterations,
    retries: 0,
    status: "running",
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    stepHistory: [],
  };
}
