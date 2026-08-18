import path from "node:path";
import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { GitHubIssue } from "../github/types.js";
import { GitHubClient } from "../github/client.js";
import { CodebaseReader } from "../codebase/reader.js";
import { PlaywrightRunner } from "../test_runner/playwright.js";
import { formatTestReport } from "../test_runner/reporter.js";
import { GitBranch } from "./Agent_Git_Operations.js";
import { buildIssueContext, determineBaseBranch } from "./Agent_Issue_Context_Builder.js";
import { runAgentLoop } from "./Agent_Runner_Engine.js";
import { summarizeResults } from "./Agent_Summarize.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import type { TaskResult } from "../utils/types.js";
import { logger } from "../utils/logger.js";

export interface OrchestratorConfig {
  agentConfig: AgentConfig;
  githubClient: GitHubClient;
  mcalendarPath: string;
  testProjectPath: string;
  maxRetries: number;
}

export async function processIssue(
  issue: GitHubIssue,
  config: OrchestratorConfig
): Promise<TaskResult> {
  const { agentConfig, githubClient, mcalendarPath, testProjectPath, maxRetries } = config;
  const reader = new CodebaseReader(mcalendarPath);
  const testReader = new CodebaseReader(testProjectPath);
  const runner = new PlaywrightRunner(testProjectPath);
  const git = new GitBranch(mcalendarPath);
  const testOutputPath = path.join(testProjectPath, "tests", "e2e");

  logger.info(`Fetching issue #${issue.number}: ${issue.title}`);

  const defaultBranch = await githubClient.getDefaultBranch();
  const baseBranch = determineBaseBranch(issue, defaultBranch);
  const branchName = GitBranch.branchName(issue.number, issue.title);

  logger.info(`🌿 Base branch: ${baseBranch}`);
  logger.info(`🌿 Creating branch: ${branchName}`);

  await git.createAndCheckout(branchName, baseBranch);

  const issueContext = buildIssueContext(issue, reader);

  // Task 1: Analyze issue
  const analyzeProvider = getTaskProvider("Agent_Analyze_Issue", agentConfig);
  logger.task("Agent_Analyze_Issue", `${getTaskProviderName("Agent_Analyze_Issue", agentConfig)}/${getTaskModel("Agent_Analyze_Issue", agentConfig)}`);

  const analysis = await runAgentLoop(
    {
      provider: analyzeProvider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig["Agent_Analyze_Issue"]?.maxTokens,
      temperature: agentConfig["Agent_Analyze_Issue"]?.temperature,
    },
    SYSTEM_PROMPTS.Agent_Analyze_Issue,
    `Analyze this issue and determine what E2E tests need to be written:\n\n${issueContext}`
  );

  logger.success(`Analysis complete`);

  // Task 2: Generate tests
  const generateProvider = getTaskProvider("Agent_Generate_Tests", agentConfig);
  logger.task("Agent_Generate_Tests", `${getTaskProviderName("Agent_Generate_Tests", agentConfig)}/${getTaskModel("Agent_Generate_Tests", agentConfig)}`);

  const testFilename = `issue-${issue.number}-${GitBranch.slugify(issue.title)}.spec.ts`;

  await runAgentLoop(
    {
      provider: generateProvider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig["Agent_Generate_Tests"]?.maxTokens,
      temperature: agentConfig["Agent_Generate_Tests"]?.temperature,
    },
    SYSTEM_PROMPTS.Agent_Generate_Tests,
    `Generate a Playwright E2E test file for this issue.\n\nFilename: ${testFilename}\n\nAnalysis:\n${analysis}\n\nIssue Context:\n${issueContext}\n\nIMPORTANT: Use the write_test_file tool to save the test as "${testFilename}".`
  );

  logger.success(`Generated: ${testFilename}`);

  // Run tests
  logger.info(`🧪 Running Playwright tests...`);
  let testResult = runner.run(testFilename);
  logger[testResult.success ? "success" : "error"](
    `${testResult.passed}/${testResult.total} tests ${testResult.success ? "passed" : "failed"}`
  );

  // Task 3: Fix tests (if failures)
  let retries = 0;
  if (!testResult.success && testResult.errors.length > 0) {
    const fixProvider = getTaskProvider("Agent_Fix_Tests", agentConfig);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.task("Agent_Fix_Tests", `attempt ${attempt}/${maxRetries}`);
      retries++;

      const errorContext = testResult.errors.join("\n\n");
      const testContent = testReader.readFile(testFilename);

      await runAgentLoop(
        {
          provider: fixProvider,
          reader,
          runner,
          testOutputPath,
          mcalendarPath,
          maxTokens: agentConfig["Agent_Fix_Tests"]?.maxTokens,
          temperature: agentConfig["Agent_Fix_Tests"]?.temperature,
        },
        SYSTEM_PROMPTS.Agent_Fix_Tests,
        `Fix the failing test. Here are the errors:\n\n${errorContext}\n\nCurrent test file:\n\`\`\`typescript\n${testContent}\n\`\`\`\n\nFilename: ${testFilename}`
      );

      testResult = runner.run(testFilename);
      logger[testResult.success ? "success" : "error"](
        `${testResult.passed}/${testResult.total} tests ${testResult.success ? "passed" : "failed"}`
      );

      if (testResult.success) break;
    }
  }

  // Task 4: Review tests
  const reviewProvider = getTaskProvider("Agent_Review_Tests", agentConfig);
  logger.task("Agent_Review_Tests", `${getTaskProviderName("Agent_Review_Tests", agentConfig)}/${getTaskModel("Agent_Review_Tests", agentConfig)}`);

  const testContent = testReader.readFile(testFilename);
  const review = await runAgentLoop(
    {
      provider: reviewProvider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig["Agent_Review_Tests"]?.maxTokens,
      temperature: agentConfig["Agent_Review_Tests"]?.temperature,
    },
    SYSTEM_PROMPTS.Agent_Review_Tests,
    `Review this generated test for quality:\n\n\`\`\`typescript\n${testContent}\n\`\`\`\n\nIssue: ${issue.title}\nAnalysis: ${analysis}`
  );

  logger.success(`Review complete`);

  // Git commit + push
  logger.info(`📤 Committing + pushing branch...`);
  await git.commit(`test: auto-generated E2E tests for issue #${issue.number}`);
  await git.push(branchName);

  // Create PR
  logger.info(`🔀 Creating PR...`);
  const pr = await githubClient.createPR({
    title: `test: E2E tests for issue #${issue.number}`,
    body: `## Automated Test Generation\n\n**Issue:** #${issue.number} — ${issue.title}\n\n### Test Results\n${formatTestReport(testResult)}\n\n### Files Changed\n- \`tests/e2e/${testFilename}\` (new)\n\n### How to Run\n\`\`\`bash\nnpx playwright test tests/e2e/${testFilename}\n\`\`\`\n\n---\n*Generated by MCalendar Test Agent*`,
    head: branchName,
    base: baseBranch,
  });

  logger.success(`PR #${pr.number} created → ${baseBranch}`);

  // Task 5: Summarize for GitHub comment
  const comment = await summarizeResults(
    agentConfig,
    reader,
    runner,
    testOutputPath,
    mcalendarPath,
    `Summarize these test results for a GitHub comment:\n\nIssue: #${issue.number} — ${issue.title}\nBranch: ${branchName}\nPR: #${pr.number}\nTest file: ${testFilename}\n\nTest Results:\n${formatTestReport(testResult)}\n\nReview: ${review}`
  );

  // Post comment
  logger.info(`💬 Posting GitHub comment...`);
  await githubClient.addComment(issue.number, comment);

  logger.success(`✅ Issue #${issue.number} complete — PR #${pr.number}, ${testResult.passed} passed, ${testResult.failed} failed`);

  return {
    success: testResult.success,
    output: `PR #${pr.number} created with ${testResult.passed} tests passed`,
    filesWritten: [testFilename],
    testsPassed: testResult.passed,
    testsFailed: testResult.failed,
    retries,
  };
}
