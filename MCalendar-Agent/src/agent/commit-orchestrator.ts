import path from "node:path";
import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CommitDiff } from "../github/types.js";
import { GitHubClient } from "../github/client.js";
import { CodebaseReader } from "../codebase/reader.js";
import { PlaywrightRunner } from "../runner/playwright.js";
import { formatTestReport } from "../runner/reporter.js";
import { GitBranch } from "./branch.js";
import { runAgentLoop } from "../tasks/agent-runner.js";
import { SYSTEM_PROMPTS } from "../tasks/prompts.js";
import type { TaskResult } from "../tasks/types.js";
import { logger } from "../utils/logger.js";
import { analyzeCommit, type CommitAnalysis } from "./commit-analyzer.js";

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

  const analyzeProvider = getTaskProvider("analyze_issue", agentConfig);
  const analysis = await analyzeCommit(diff, {
    provider: analyzeProvider,
    reader,
    runner,
    testOutputPath,
    mcalendarPath,
    maxTokens: agentConfig.tasks.analyze_issue?.maxTokens,
    temperature: agentConfig.tasks.analyze_issue?.temperature,
  });

  if (!analysis.needsTests) {
    logger.info(`⏭️ Skipping commit ${shortSha}: ${analysis.reason}`);
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

  const branchName = `test/commit-${shortSha}`;
  logger.info(`🌿 Creating branch: ${branchName} from ${targetBranch}`);

  const git = new GitBranch(mcalendarPath);
  await git.createAndCheckout(branchName, targetBranch);

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

  const generateProvider = getTaskProvider("generate_tests", agentConfig);
  logger.task("generate_tests", `${getTaskProviderName("generate_tests", agentConfig)}/${getTaskModel("generate_tests", agentConfig)}`);

  const testFilename = `commit-${shortSha}.spec.ts`;

  await runAgentLoop(
    {
      provider: generateProvider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig.tasks.generate_tests?.maxTokens,
      temperature: agentConfig.tasks.generate_tests?.temperature,
    },
    SYSTEM_PROMPTS.generate_tests,
    `Generate a Playwright E2E test file for this commit.\n\nFilename: ${testFilename}\n\nScope: ${analysis.scope ?? "General E2E testing"}\n\nCommit Context:\n${commitContext}\n\nIMPORTANT: Use the write_test_file tool to save the test as "${testFilename}".`
  );

  logger.success(`Generated: ${testFilename}`);

  logger.info(`🧪 Running Playwright tests...`);
  let testResult = runner.run(testFilename);
  logger[testResult.success ? "success" : "error"](
    `${testResult.passed}/${testResult.total} tests ${testResult.success ? "passed" : "failed"}`
  );

  let retries = 0;
  if (!testResult.success && testResult.errors.length > 0) {
    const fixProvider = getTaskProvider("fix_tests", agentConfig);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.task("fix_tests", `attempt ${attempt}/${maxRetries}`);
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
          maxTokens: agentConfig.tasks.fix_tests?.maxTokens,
          temperature: agentConfig.tasks.fix_tests?.temperature,
        },
        SYSTEM_PROMPTS.fix_tests,
        `Fix the failing test. Here are the errors:\n\n${errorContext}\n\nCurrent test file:\n\`\`\`typescript\n${testContent}\n\`\`\`\n\nFilename: ${testFilename}`
      );

      testResult = runner.run(testFilename);
      logger[testResult.success ? "success" : "error"](
        `${testResult.passed}/${testResult.total} tests ${testResult.success ? "passed" : "failed"}`
      );

      if (testResult.success) break;
    }
  }

  const reviewProvider = getTaskProvider("review_tests", agentConfig);
  logger.task("review_tests", `${getTaskProviderName("review_tests", agentConfig)}/${getTaskModel("review_tests", agentConfig)}`);

  const testContent = testReader.readFile(testFilename);
  await runAgentLoop(
    {
      provider: reviewProvider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig.tasks.review_tests?.maxTokens,
      temperature: agentConfig.tasks.review_tests?.temperature,
    },
    SYSTEM_PROMPTS.review_tests,
    `Review this generated test for quality:\n\n\`\`\`typescript\n${testContent}\n\`\`\`\n\nCommit: ${shortSha} — ${diff.message.split("\n")[0]}`
  );

  logger.success(`Review complete`);

  logger.info(`📤 Committing + pushing branch...`);
  await git.commit(`test: auto-generated E2E tests for commit ${shortSha}`);
  await git.push(branchName);

  logger.info(`🔀 Creating PR...`);
  const pr = await githubClient.createPR({
    title: `test: E2E tests for commit ${shortSha}`,
    body: `## Automated Test Generation\n\n**Commit:** ${shortSha} — ${diff.message.split("\n")[0]}\n**Author:** ${diff.author}\n\n### Analysis\n${analysis.reason}\n\n### Test Results\n${formatTestReport(testResult)}\n\n### Files Changed in Commit\n${changedFilesContext}\n\n### Test File Added\n- \`tests/e2e/${testFilename}\`\n\n### How to Run\n\`\`\`bash\nnpx playwright test tests/e2e/${testFilename}\n\`\`\`\n\n---\n*Generated by MCalendar Test Agent*`,
    head: branchName,
    base: targetBranch,
  });

  logger.success(`PR #${pr.number} created → ${targetBranch}`);

  const summarizeProvider = getTaskProvider("summarize", agentConfig);
  logger.task("summarize", `${getTaskProviderName("summarize", agentConfig)}/${getTaskModel("summarize", agentConfig)}`);

  const comment = await runAgentLoop(
    {
      provider: summarizeProvider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig.tasks.summarize?.maxTokens,
      temperature: agentConfig.tasks.summarize?.temperature,
    },
    SYSTEM_PROMPTS.summarize,
    `Summarize these test results for a GitHub comment:\n\nCommit: ${shortSha} — ${diff.message.split("\n")[0]}\nBranch: ${branchName}\nPR: #${pr.number}\nTest file: ${testFilename}\n\nTest Results:\n${formatTestReport(testResult)}`
  );

  logger.info(`💬 Posting GitHub comment on commit...`);
  await githubClient.addComment(0, comment);

  logger.success(`✅ Commit ${shortSha} complete — PR #${pr.number}, ${testResult.passed} passed, ${testResult.failed} failed`);

  return {
    success: testResult.success,
    output: `PR #${pr.number} created with ${testResult.passed} tests passed`,
    filesWritten: [testFilename],
    testsPassed: testResult.passed,
    testsFailed: testResult.failed,
    retries,
  };
}
