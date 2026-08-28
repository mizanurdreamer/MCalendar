import { v4 as uuidv4 } from "uuid";
import path from "node:path";
import type { AgentConfig } from "../providers/types.js";
import type { GitHubIssue } from "../github/types.js";
import { GitHubClient } from "../github/client.js";
import { CodebaseReader } from "../codebase/reader.js";
import { PlaywrightRunner } from "../test_runner/playwright.js";
import { GitBranch } from "../github/git_operations.js";
import type { TaskResult } from "../utils/types.js";
import { logger } from "../utils/logger.js";
import { setDiagnosticConfig } from "../utils/diagnostic_tools.js";
import { setDatabaseUrl } from "../utils/database_tools.js";
import { createAgenticGraph } from "../core/graph.js";
import { createInitialAgentState } from "../core/state.js";
import { AgentIssueAnalyzer } from "../agents/agent_issue_analyzer.js";
import { AgentTestsGenerator } from "../agents/agent_tests_generator.js";
import { AgentTestsReviewer } from "../agents/agent_tests_reviewer.js";
import { AgentTestsReportGenerator } from "../agents/agent_tests_report_generator.js";
import { AgentSummarize } from "../agents/agent_summarize.js";
import { AgentCritic } from "../core/agent_critic.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL } from "../utils/constants.js";
import { initMcpClient, shutdownMcpClient } from "../mcp/client.js";

export interface OrchestratorConfig {
  agentConfig: AgentConfig;
  githubClient: GitHubClient;
  codebasePath: string;
  testProjectPath: string;
  maxRetries: number;
  maxIterations: number;
  maxPipelineSteps: number;
  projectName: string;
  baseBranch?: string;
  databaseUrl?: string;
  apiBaseUrl?: string;
  commitAutoApprove?: boolean;
  playwrightMcpEnabled?: boolean;
  playwrightMcpBrowser?: string;
  playwrightWorkers?: number;
}

export async function processIssue(
  issue: GitHubIssue,
  config: OrchestratorConfig
): Promise<TaskResult> {
  const { agentConfig, githubClient, codebasePath, testProjectPath, maxRetries, maxIterations, maxPipelineSteps, projectName } = config;
  const reader = new CodebaseReader(codebasePath);
  const testReader = new CodebaseReader(testProjectPath);
  const runner = new PlaywrightRunner(testProjectPath, config.playwrightWorkers ?? 6);
  const git = new GitBranch(codebasePath);

  const testOutputPath = path.join(testProjectPath, "tests");

  setDiagnosticConfig({ databaseUrl: config.databaseUrl, apiBaseUrl: config.apiBaseUrl });
  setDatabaseUrl(config.databaseUrl ?? "");

  // Initialize Playwright MCP if enabled
  if (config.playwrightMcpEnabled) {
    try {
      await initMcpClient(config.playwrightMcpBrowser ?? "chromium");
      logger.info(`[Orchestrator] Playwright MCP initialized (browser: ${config.playwrightMcpBrowser ?? "chromium"})`);
    } catch (err) {
      logger.warn(`[Orchestrator] Failed to initialize Playwright MCP: ${err}`);
    }
  }

  logger.info(`Fetching issue #${issue.number}: ${issue.title}`);

  const defaultBranch = await githubClient.getDefaultBranch();
  //const baseBranch = config.baseBranch || defaultBranch;
  const baseBranch = "main-agentic-ai-v2";
  const branchName = GitBranch.branchName(issue.number, issue.title);

  const runId = `issue-${issue.number}-${Date.now()}`;
  
  const provider = getTaskProvider(AGENT_NAMES.AGENT_ISSUE_ANALYZER, agentConfig);
  logger.task("orchestrator", `${getTaskProviderName(AGENT_NAMES.AGENT_ISSUE_ANALYZER, agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_ISSUE_ANALYZER, agentConfig)}`);

  const initialState = createInitialAgentState({
    mode: MODE.ISSUE,
    runId,
    issue,
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
    baseBranch,
    branchName,
    playwrightWorkers: config.playwrightWorkers ?? 6,
  });

  const graph = createAgenticGraph({
    memoryType: "local",
    enableCritic: true,
    enableHumanGates: !config.commitAutoApprove,
    maxParallelAgents: 3,
  });

  await graph.initialize();

  graph.registerAgent(AGENT_NAMES.AGENT_ISSUE_ANALYZER, new AgentIssueAnalyzer(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_ISSUE_ANALYZER)));
  graph.registerAgent(AGENT_NAMES.AGENT_TESTS_GENERATOR, new AgentTestsGenerator(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_GENERATOR)));
  graph.registerAgent(AGENT_NAMES.AGENT_TESTS_REVIEWER, new AgentTestsReviewer(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_REVIEWER)));
  graph.registerAgent(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, new AgentTestsReportGenerator(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR)));
  graph.registerAgent(AGENT_NAMES.AGENT_SUMMARIZE, new AgentSummarize(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_SUMMARIZE)));

  graph.registerCritic(AGENT_NAMES.AGENT_ISSUE_ANALYZER, new AgentCritic(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_ISSUE_ANALYZER), AGENT_NAMES.AGENT_ISSUE_ANALYZER));
  graph.registerCritic(AGENT_NAMES.AGENT_TESTS_GENERATOR, new AgentCritic(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_GENERATOR), AGENT_NAMES.AGENT_TESTS_GENERATOR));
  graph.registerCritic(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, new AgentCritic(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR), AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR));
  graph.registerCritic(AGENT_NAMES.AGENT_SUMMARIZE, new AgentCritic(initialState, createTaskContext(initialState, AGENT_NAMES.AGENT_SUMMARIZE), AGENT_NAMES.AGENT_SUMMARIZE));

  // Run with thread_id for checkpointing
  const threadId = runId;

  // Create and checkout the test branch before running the pipeline
  try {
    await git.createAndCheckout(branchName, baseBranch);
  } catch (err) {
    logger.warn(`[Orchestrator] Branch creation failed, continuing on current branch: ${err}`);
  }
  
  let result = await graph.invoke(initialState, { configurable: { thread_id: threadId } });

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

  if (result.testResult) {
    logger.success(
      `Issue #${issue.number} complete — ${result.testResult.passed} passed, ${result.testResult.failed} failed`
    );
  }

  // Commit, push, and create PR if tests passed
  if (result.testResult?.success && result.testFilename) {
    try {
      const commitMsg = `test: add E2E tests for issue #${issue.number}`;
      await git.commitAndPush(commitMsg, branchName, testOutputPath);
      
      const pr = await git.createPR(githubClient, {
        title: `Test: Issue #${issue.number} — ${issue.title}`,
        body: result.summary ?? `Automated E2E tests for issue #${issue.number}\n\n${result.testResult.passed} tests passed.`,
        head: branchName,
        base: baseBranch,
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