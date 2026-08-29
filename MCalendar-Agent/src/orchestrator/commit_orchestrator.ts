import { v4 as uuidv4 } from "uuid";
import path from "node:path";
import type { AgentConfig } from "../providers/types.js";
import type { CommitDiff } from "../github/types.js";
import { GitHubClient } from "../github/client.js";
import { CodebaseReader } from "../codebase/reader.js";
import { PlaywrightRunner } from "../test_runner/playwright.js";
import { GitBranch } from "../github/git_operations.js";
import type { TaskResult } from "../utils/types.js";
import { logger } from "../utils/logger.js";
import { setDiagnosticConfig } from "../utils/diagnostic_tools.js";
import { setDatabaseUrl } from "../utils/database_tools.js";
import { createAgenticGraph } from "../core/graph.js";
import { metrics } from "../core/metrics.js";
import { createInitialAgentState } from "../core/state.js";
import { registerAllTools } from "../core/register_tools.js";
import { AgentCommitAnalyzer } from "../agents/agent_commit_analyzer.js";
import { AgentTestsGenerator } from "../agents/agent_tests_generator.js";
import { AgentTestsReviewer } from "../agents/agent_tests_reviewer.js";
import { AgentTestsReportGenerator } from "../agents/agent_tests_report_generator.js";
import { AgentSummarize } from "../agents/agent_summarize.js";
import { AgentCritic } from "../core/agent_critic.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL } from "../utils/constants.js";
import { initMcpClient, shutdownMcpClient } from "../mcp/client.js";
import { AppServerManager } from "../server/app_server.js";

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
  agentMemoryDatabaseUrl?: string;
  apiBaseUrl?: string;
  commitAutoApprove?: boolean;
  playwrightMcpEnabled?: boolean;
  playwrightMcpBrowser?: string;
  playwrightWorkers?: number;
  pipelineTimeoutMs?: number;
  memoryType?: "local" | "postgres";
}

export async function processCommit(
  diff: CommitDiff,
  config: CommitOrchestratorConfig
): Promise<TaskResult & { skipped?: boolean; analysis?: { needsTests: boolean; reason: string; scope: string | null } }> {
  const { agentConfig, githubClient, codebasePath, testProjectPath, maxRetries, maxIterations, maxPipelineSteps, targetBranch, projectName } = config;
  const reader = new CodebaseReader(codebasePath);
  const testReader = new CodebaseReader(testProjectPath);
  const runner = new PlaywrightRunner(testProjectPath, config.playwrightWorkers ?? 6);
  const git = new GitBranch(codebasePath);
  const testOutputPath = path.join(testProjectPath, "tests");

  // Initialize tool registry
  registerAllTools(reader, runner, codebasePath, testProjectPath, testOutputPath);
  const metricsRunId = uuidv4();

  metrics.startPipeline(metricsRunId, "commit");

  setDiagnosticConfig({ databaseUrl: config.databaseUrl, apiBaseUrl: config.apiBaseUrl });
  setDatabaseUrl(config.databaseUrl ?? "");

  // Start app server if MCP is enabled (agents need live app for browser exploration)
  let appServer: AppServerManager | null = null;
  if (config.playwrightMcpEnabled) {
    appServer = new AppServerManager();
    const apiBaseUrl = config.apiBaseUrl || "http://localhost:3000";
    await appServer.start(config.codebasePath, 3000, apiBaseUrl);
  }

  // Initialize Playwright MCP if enabled
  if (config.playwrightMcpEnabled) {
    try {
      await initMcpClient(config.playwrightMcpBrowser ?? "chromium");
      logger.info(`[Orchestrator] Playwright MCP initialized (browser: ${config.playwrightMcpBrowser ?? "chromium"})`);
    } catch (err) {
      logger.warn(`[Orchestrator] Failed to initialize Playwright MCP: ${err}`);
    }
  }

  const shortSha = diff.sha.slice(0, 7);
  logger.info(`Processing commit ${shortSha}: ${diff.message.split("\n")[0]}`);

  const branchName = `test/commit-${shortSha}`;

  const runId = `commit-${shortSha}-${Date.now()}`;

  const provider = getTaskProvider(AGENT_NAMES.AGENT_COMMIT_ANALYZER, agentConfig);
  logger.task("orchestrator", `${getTaskProviderName(AGENT_NAMES.AGENT_COMMIT_ANALYZER, agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_COMMIT_ANALYZER, agentConfig)}`);

  const initialState = createInitialAgentState({
    mode: MODE.COMMIT,
    runId,
    commitDiff: diff,
    agentConfig,
    reader,
    testReader,
    runner,
    git,
    githubClient,
    provider,
    codebasePath,
    testProjectPath,
    testOutputPath,
    projectName,
    maxRetries,
    maxIterations,
    maxPipelineSteps,
    commitAutoApprove: config.commitAutoApprove ?? true,
    baseBranch: targetBranch,
    branchName,
    apiBaseUrl: config.apiBaseUrl,
  });

  const graph = createAgenticGraph({
    memoryType: config.memoryType || "local",
    agentMemoryDatabaseUrl: config.agentMemoryDatabaseUrl,
    enableCritic: true,
    enableHumanGates: !config.commitAutoApprove,
    maxParallelAgents: 3,
  });

  await graph.initialize();

  graph.registerAgent(AGENT_NAMES.AGENT_COMMIT_ANALYZER, new AgentCommitAnalyzer(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_COMMIT_ANALYZER)));
  graph.registerAgent(AGENT_NAMES.AGENT_TESTS_GENERATOR, new AgentTestsGenerator(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_GENERATOR)));
  graph.registerAgent(AGENT_NAMES.AGENT_TESTS_REVIEWER, new AgentTestsReviewer(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_REVIEWER)));
  graph.registerAgent(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, new AgentTestsReportGenerator(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR)));
  graph.registerAgent(AGENT_NAMES.AGENT_SUMMARIZE, new AgentSummarize(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_SUMMARIZE)));

  graph.registerCritic(AGENT_NAMES.AGENT_COMMIT_ANALYZER, new AgentCritic(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_COMMIT_ANALYZER), AGENT_NAMES.AGENT_COMMIT_ANALYZER));
  graph.registerCritic(AGENT_NAMES.AGENT_TESTS_GENERATOR, new AgentCritic(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_GENERATOR), AGENT_NAMES.AGENT_TESTS_GENERATOR));
  graph.registerCritic(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, new AgentCritic(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR), AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR));
  graph.registerCritic(AGENT_NAMES.AGENT_SUMMARIZE, new AgentCritic(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_SUMMARIZE), AGENT_NAMES.AGENT_SUMMARIZE));

  // Run with thread_id for checkpointing
  const threadId = runId;

  // Create and checkout the test branch before running the pipeline
  try {
    await git.createAndCheckout(branchName, targetBranch);
  } catch (err) {
    logger.warn(`[Orchestrator] Branch creation failed, continuing on current branch: ${err}`);
  }
  
  // Apply pipeline-level timeout
  const pipelineTimeoutMs = config.pipelineTimeoutMs ?? 30 * 60 * 1000; // 30 min default
  const pipelineTimer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Pipeline timed out after ${pipelineTimeoutMs}ms`)), pipelineTimeoutMs)
  );

  let result: Awaited<ReturnType<typeof graph.invoke>>;
  try {
    result = await Promise.race([
      graph.invoke(initialState, { configurable: { thread_id: threadId } }),
      pipelineTimer,
    ]);
  } catch (err) {
    if (err instanceof Error && err.message.includes("timed out")) {
      logger.error(`[Orchestrator] Pipeline timed out after ${pipelineTimeoutMs}ms`);
      result = { ...initialState, status: PIPELINE_STATUS.FAILED, error: err.message };
    } else {
      throw err;
    }
  }

  // Handle human approval interrupts
  while (result.status === PIPELINE_STATUS.AWAITING_HUMAN) {
    const pending = result.humanApprovals?.find(a => !a.resolved);
    if (!pending) break;

    logger.info(`[Orchestrator] Human approval required: ${pending.title}`);
    
    // Auto-approve if commitAutoApprove is true, otherwise reject
    const resolution = config.commitAutoApprove ? "approve" : "reject";
    logger.info(`[Orchestrator] Auto-approving: ${config.commitAutoApprove}`);
    
    result = await graph.resumeAfterApproval(threadId, resolution);
  }

  if (result.status === PIPELINE_STATUS.SKIPPED && result.commitAnalysis && !result.commitAnalysis.needsTests) {
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
      `Commit ${shortSha} complete — ${result.testResult.passed} passed, ${result.testResult.failed} failed`
    );
  }

  // Commit, push, and create PR if tests passed
  if (result.testResult?.success && result.testFilename) {
    try {
      const commitMsg = `test: add E2E tests for commit ${shortSha}`;
      await git.commitAndPush(commitMsg, branchName, testOutputPath);
      
      const pr = await git.createPR(githubClient, {
        title: `Test: Commit ${shortSha} — ${diff.message.split("\n")[0]}`,
        body: result.summary ?? `Automated E2E tests for commit ${shortSha}\n\n${result.testResult.passed} tests passed.`,
        head: branchName,
        base: targetBranch,
      });
      result.prUrl = pr.html_url;
      logger.success(`[Orchestrator] PR created: ${pr.html_url}`);
    } catch (err) {
      logger.error(`[Orchestrator] Failed to commit/push/create PR: ${err}`);
    }
  }

  // Shutdown Playwright MCP if it was initialized
  if (config.playwrightMcpEnabled) {
    try {
      await shutdownMcpClient();
    } catch (err) {
      logger.warn(`[Orchestrator] Failed to shutdown Playwright MCP: ${err}`);
    }
  }

  // Stop app server if we started it
  if (appServer) {
    await appServer.stop();
  }

  metrics.endPipeline(
    result.status === PIPELINE_STATUS.COMPLETED && (result.testResult?.success ?? false) ? "completed" : "failed",
    result.error
  );

  return {
    success: result.status === PIPELINE_STATUS.COMPLETED && (result.testResult?.success ?? false),
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

function createTaskContext(state: any, agentName: string) {
  return {
    provider: state.provider,
    reader: state.reader,
    runner: state.runner,
    testOutputPath: state.testOutputPath,
    codebasePath: state.codebasePath,
    maxTokens: state.agentConfig[agentName]?.maxTokens,
    temperature: state.agentConfig[agentName]?.temperature,
    maxRetries: state.maxRetries,
  };
}