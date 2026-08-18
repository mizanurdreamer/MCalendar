import path from "node:path";
import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider } from "../providers/registry.js";
import type { CommitDiff } from "../github/types.js";
import { GitHubClient } from "../github/client.js";
import { CodebaseReader } from "../codebase/reader.js";
import { PlaywrightRunner } from "../test_runner/playwright.js";
import { formatTestReport } from "../test_runner/reporter.js";
import { GitBranch } from "../github/git_operations.js";
import { runAgentLoop } from "../agent/Agent_Runner_Engine.js";
import { generateTests } from "../agent/Agent_Tests_Generator.js";
import { runTests } from "../agent/Agent_Tests_Runner.js";
import { generateTestReport } from "../agent/Agent_Tests_Report_Generator.js";
import { reviewTests } from "../agent/Agent_Tests_Reviewer.js";
import { autoCommit } from "../agent/Agent_Auto_Commit.js";
import { summarizeResults } from "../agent/Agent_Summarize.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import type { TaskResult } from "../utils/types.js";
import { runTestsLoop } from "../utils/test_pipeline.js";
import { logger } from "../utils/logger.js";
import { analyzeCommit, type CommitAnalysis } from "../agent/Agent_Commit_Triage.js";

export interface CommitOrchestratorConfig {
  agentConfig: AgentConfig;
  githubClient: GitHubClient;
  mcalendarPath: string;
  testProjectPath: string;
  maxRetries: number;
  targetBranch: string;
}

export async function processCommit(
  diff: CommitDiff,
  config: CommitOrchestratorConfig
): Promise<TaskResult & { skipped?: boolean; analysis?: CommitAnalysis }> {
  const { agentConfig, githubClient, mcalendarPath, testProjectPath, maxRetries, targetBranch } = config;
  const reader = new CodebaseReader(mcalendarPath);
  const testReader = new CodebaseReader(testProjectPath);
  const runner = new PlaywrightRunner(testProjectPath);
  const testOutputPath = path.join(testProjectPath, "tests", "e2e");

  const shortSha = diff.sha.slice(0, 7);
  logger.info(`Processing commit ${shortSha}: ${diff.message.split("\n")[0]}`);

  // Step 1: Triage — decide if tests needed
  const analyzeProvider = getTaskProvider("Agent_Commit_Analyzer", agentConfig);
  const analysis = await analyzeCommit(diff, {
    provider: analyzeProvider,
    reader,
    runner,
    testOutputPath,
    mcalendarPath,
    maxTokens: agentConfig["Agent_Commit_Analyzer"]?.maxTokens,
    temperature: agentConfig["Agent_Commit_Analyzer"]?.temperature,
  });

  if (!analysis.needsTests) {
    logger.info(`Skipping commit ${shortSha}: ${analysis.reason}`);
    return {
      success: true,
      output: `Skipped — ${analysis.reason}`,
      testsPassed: 0,
      testsFailed: 0,
      retries: 0,
      skipped: true,
      analysis,
    };
  }

  // Step 2: Create branch
  const branchName = `test/commit-${shortSha}`;
  logger.info(`Creating branch: ${branchName} from ${targetBranch}`);

  const git = new GitBranch(mcalendarPath);
  await git.createAndCheckout(branchName, targetBranch);

  // Step 3: Build context
  const changedFilesContext = diff.files
    .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
    .join("\n");

  const commitContext = `## COMMIT: ${shortSha} — ${diff.message.split("\n")[0]}

**Author:** ${diff.author}
**Changed files:**
${changedFilesContext}

**Test scope suggestion:** ${analysis.scope ?? "General E2E testing of changed functionality"}

**Diff details:**
${diff.files.map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch ?? "(no patch)"}\n\`\`\``).join("\n\n")}`;

  // Step 4: Generate tests
  const testFilename = `commit-${shortSha}.spec.ts`;

  await generateTests(
    agentConfig,
    reader,
    runner,
    testOutputPath,
    mcalendarPath,
    `Generate a Playwright E2E test file for this commit.\n\nFilename: ${testFilename}\n\nScope: ${analysis.scope ?? "General E2E testing"}\n\nCommit Context:\n${commitContext}\n\nIMPORTANT: Use the write_test_file tool to save the test as "${testFilename}".`
  );

  // Step 5: Run tests + Review/fix loop
  const { testResult, retries } = await runTestsLoop({
    maxRetries,
    testFilename,
    runTests: () => runTests(runner, testFilename),
    reviewTests: (testContent, errorContext) =>
      reviewTests(
        agentConfig,
        reader,
        runner,
        testOutputPath,
        mcalendarPath,
        testFilename,
        testContent,
        `Fix the failing test. Here are the errors:\n\n${errorContext}`
      ),
    readTestContent: () => testReader.readFile(testFilename),
  });

  // Step 6: Generate report
  const report = await generateTestReport(agentConfig, reader, runner, testOutputPath, mcalendarPath, testResult);

  // Step 7: Commit + Push + PR
  const commitResult = await autoCommit(
    git,
    githubClient,
    branchName,
    targetBranch,
    `test: auto-generated E2E tests for commit ${shortSha}`,
    `test: E2E tests for commit ${shortSha}`,
    `## Automated Test Generation\n\n**Commit:** ${shortSha} — ${diff.message.split("\n")[0]}\n**Author:** ${diff.author}\n\n### Analysis\n${analysis.reason}\n\n### Test Results\n${formatTestReport(testResult)}\n\n### Files Changed in Commit\n${changedFilesContext}\n\n### Test File Added\n- \`tests/e2e/${testFilename}\`\n\n### How to Run\n\`\`\`bash\nnpx playwright test tests/e2e/${testFilename}\n\`\`\`\n\n---\n*Generated by MCalendar Test Agent*`
  );

  // Step 8: Summarize
  const comment = await summarizeResults(
    agentConfig,
    reader,
    runner,
    testOutputPath,
    mcalendarPath,
    `Summarize these test results for a GitHub comment:\n\nCommit: ${shortSha} — ${diff.message.split("\n")[0]}\nBranch: ${branchName}\nTest file: ${testFilename}\n\nTest Results:\n${formatTestReport(testResult)}\n\nReport:\n${report}`
  );

  await githubClient.addComment(0, comment);

  logger.success(`Commit ${shortSha} complete — pushed to ${branchName}, ${testResult.passed} passed, ${testResult.failed} failed`);

  return {
    success: testResult.success,
    output: `Pushed to ${branchName} with ${testResult.passed} tests passed`,
    filesWritten: [testFilename],
    testsPassed: testResult.passed,
    testsFailed: testResult.failed,
    retries,
  };
}
