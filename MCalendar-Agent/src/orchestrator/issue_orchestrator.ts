import path from "node:path";
import type { AgentConfig } from "../providers/types.js";
import type { GitHubIssue } from "../github/types.js";
import { GitHubClient } from "../github/client.js";
import { CodebaseReader } from "../codebase/reader.js";
import { PlaywrightRunner } from "../test_runner/playwright.js";
import { GitBranch } from "../github/git_operations.js";
import type { TaskResult } from "../utils/types.js";
import { logger } from "../utils/logger.js";
import { createSharedContext } from "../engine/shared_context.js";
import { runPipeline } from "../engine/pipeline_engine.js";
import { getIssuePipeline } from "../engine/step_definitions.js";

export interface OrchestratorConfig {
  agentConfig: AgentConfig;
  githubClient: GitHubClient;
  codebasePath: string;
  testProjectPath: string;
  maxRetries: number;
  projectName: string;
}

export async function processIssue(
  issue: GitHubIssue,
  config: OrchestratorConfig
): Promise<TaskResult> {
  const { agentConfig, githubClient, codebasePath, testProjectPath, maxRetries, projectName } = config;
  const reader = new CodebaseReader(codebasePath);
  const testReader = new CodebaseReader(testProjectPath);
  const runner = new PlaywrightRunner(testProjectPath);
  const git = new GitBranch(codebasePath);

  const testOutputPath = path.join(testProjectPath, "tests");

  logger.info(`Fetching issue #${issue.number}: ${issue.title}`);

  const defaultBranch = await githubClient.getDefaultBranch();
  const baseBranch = "main-agentic-ai";
  const branchName = GitBranch.branchName(issue.number, issue.title);

  const ctx = createSharedContext({
    mode: "issue",
    issue,
    agentConfig,
    reader,
    testReader,
    runner,
    git,
    githubClient,
    codebasePath,
    testProjectPath,
    testOutputPath,
    projectName,
    maxRetries,
    baseBranch,
    branchName,
  });

  const result = await runPipeline(getIssuePipeline(), ctx);

  if (result.testResult) {
    logger.success(
      `Issue #${issue.number} complete — pushed to ${result.branchName}, ${result.testResult.passed} passed, ${result.testResult.failed} failed`
    );
  }

  return {
    success: result.status === "completed" && (result.testResult?.success ?? false),
    output: `Pushed to ${result.branchName} with ${result.testResult?.passed ?? 0} tests passed`,
    filesWritten: result.testFilename ? [result.testFilename] : [],
    testsPassed: result.testResult?.passed ?? 0,
    testsFailed: result.testResult?.failed ?? 0,
    retries: result.retries,
  };
}
