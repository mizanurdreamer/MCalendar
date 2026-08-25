import path from "node:path";
import type { AgentConfig } from "../providers/types.js";
import type { CommitDiff } from "../github/types.js";
import { GitHubClient } from "../github/client.js";
import { CodebaseReader } from "../codebase/reader.js";
import { PlaywrightRunner } from "../test_runner/playwright.js";
import { GitBranch } from "../github/git_operations.js";
import type { TaskResult } from "../utils/types.js";
import { logger } from "../utils/logger.js";
import { createSharedContext } from "../engine/shared_context.js";
import { runPipeline } from "../engine/pipeline_engine.js";
import { getCommitPipeline } from "../engine/step_definitions.js";
import { setDiagnosticConfig } from "../utils/diagnostic_tools.js";
import { setDatabaseUrl } from "../utils/database_tools.js";

export interface CommitOrchestratorConfig {
  agentConfig: AgentConfig;
  githubClient: GitHubClient;
  codebasePath: string;
  testProjectPath: string;
  maxRetries: number;
  maxIterations: number;
  maxPipelineSteps: number;
  targetBranch: string;
  projectName: string;
  databaseUrl?: string;
  apiBaseUrl?: string;
  commitAutoApprove?: boolean;
}

export async function processCommit(
  diff: CommitDiff,
  config: CommitOrchestratorConfig
): Promise<TaskResult & { skipped?: boolean; analysis?: { needsTests: boolean; reason: string; scope: string | null } }> {
  const { agentConfig, githubClient, codebasePath, testProjectPath, maxRetries, maxIterations, maxPipelineSteps, targetBranch, projectName } = config;
  const reader = new CodebaseReader(codebasePath);
  const testReader = new CodebaseReader(testProjectPath);
  const runner = new PlaywrightRunner(testProjectPath);
  const testOutputPath = path.join(testProjectPath, "tests");

  setDiagnosticConfig({ databaseUrl: config.databaseUrl, apiBaseUrl: config.apiBaseUrl });
  setDatabaseUrl(config.databaseUrl ?? "");

  const shortSha = diff.sha.slice(0, 7);
  logger.info(`Processing commit ${shortSha}: ${diff.message.split("\n")[0]}`);

  const branchName = `test/commit-${shortSha}`;

  const ctx = createSharedContext({
    mode: "commit",
    commitDiff: diff,
    agentConfig,
    reader,
    testReader,
    runner,
    git: new GitBranch(codebasePath),
    githubClient,
    codebasePath,
    testProjectPath,
    testOutputPath,
    projectName,
    maxRetries,
    maxIterations,
    maxPipelineSteps,
    baseBranch: targetBranch,
    branchName,
    commitAutoApprove: config.commitAutoApprove ?? true,
  });

  const result = await runPipeline(getCommitPipeline(), ctx);

  if (result.status === "skipped" && result.commitAnalysis && !result.commitAnalysis.needsTests) {
    logger.info(`Commit ${shortSha} skipped: ${result.commitAnalysis.reason}`);
    return {
      success: true,
      output: `Skipped — ${result.commitAnalysis.reason}`,
      testsPassed: 0,
      testsFailed: 0,
      retries: 0,
      skipped: true,
      analysis: result.commitAnalysis,
    };
  }

  if (result.testResult) {
    logger.success(
      `Commit ${shortSha} complete — pushed to ${result.branchName}, ${result.testResult.passed} passed, ${result.testResult.failed} failed`
    );
  }

  return {
    success: result.status === "completed" && (result.testResult?.success ?? false),
    output: `Pushed to ${result.branchName} with ${result.testResult?.passed ?? 0} tests passed`,
    filesWritten: result.testFilename ? [result.testFilename] : [],
    testsPassed: result.testResult?.passed ?? 0,
    testsFailed: result.testResult?.failed ?? 0,
    retries: result.retries,
    retryHistory: result.retryHistory,
    report: result.report,
    reportPath: result.reportPath,
  };
}
