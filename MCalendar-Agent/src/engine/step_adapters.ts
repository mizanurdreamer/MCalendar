import type { SharedContext, StepFunction, CommitAnalysis, IssueAnalysis } from "./shared_context.js";
import { analyzeIssue } from "../agent/agent_issue_analyzer.js";
import { analyzeCommit } from "../agent/agent_commit_analyzer.js";
import { generateTests } from "../agent/agent_tests_generator.js";
import { reviewTests } from "../agent/agent_tests_reviewer.js";
import { generateTestReport } from "../agent/agent_tests_report_generator.js";
import { summarizeResults } from "../agent/agent_summarize.js";
import { runTests } from "../test_runner/tests_runner.js";
import { formatTestReport } from "../test_runner/reporter.js";
import { GitBranch } from "../github/git_operations.js";
import { logger } from "../utils/logger.js";

function record(ctx: SharedContext, name: string, agent: string | undefined, output: string, decision: string) {
  ctx.stepHistory.push({
    name,
    timestamp: Date.now(),
    agent,
    output: output.slice(0, 200),
    decision,
  });
}

function parseIssueAnalysis(raw: string): IssueAnalysis {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as IssueAnalysis;
    }
  } catch { /* fall through */ }
  return {
    summary: raw.slice(0, 500),
    functionality_to_test: [],
    relevant_files: [],
    test_scenarios: [],
    edge_cases: [],
    api_endpoints: [],
    role_checks: [],
    needs_tests: !raw.toUpperCase().includes("NO_TESTS_NEEDED"),
  };
}

export function adaptIssueAnalyzer(): StepFunction {
  return async (ctx) => {
    if (!ctx.issue) {
      return { action: "stop", reason: "No issue provided" };
    }

    const issue = ctx.issue;
    const userMessage = `Analyze this GitHub issue and determine what E2E tests need to be written.

ISSUE #${issue.number}: ${issue.title}
LABELS: ${issue.labels.join(", ") || "none"}
CREATED: ${issue.created_at}

DESCRIPTION:
${issue.body}

Read the project source code using your tools to understand the codebase before analyzing.
Respond with ONLY valid JSON.`;

    const output = await analyzeIssue(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath, userMessage,
      ctx.projectName
    );

    const analysis = parseIssueAnalysis(output);
    ctx.issueAnalysis = analysis;

    if (!analysis.needs_tests) {
      logger.info(`Issue #${issue.number}: ${analysis.summary}`);
      record(ctx, "analyze_issue", "agent_issue_analyzer", analysis.summary, "stop");
      return { action: "stop", reason: `Analysis: ${analysis.summary}` };
    }

    logger.info(`Issue #${issue.number}: ${analysis.test_scenarios.length} test scenarios identified`);
    record(ctx, "analyze_issue", "agent_issue_analyzer", analysis.summary, "next");
    return { action: "next" };
  };
}

export function adaptCommitAnalyzer(): StepFunction {
  return async (ctx) => {
    if (!ctx.commitDiff) {
      return { action: "stop", reason: "No commit diff provided" };
    }

    const diff = ctx.commitDiff;
    const shortSha = diff.sha.slice(0, 7);

    const fileList = diff.files
      .map((f) => `  ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
      .join("\n");
    const diffContent = diff.files
      .map((f) => `--- ${f.filename}\n${f.patch ?? "(binary or no patch)"}`)
      .join("\n\n");

    const userMessage = `Analyze this commit to determine if it needs new or updated E2E tests.

COMMIT: ${shortSha} — ${diff.message}
AUTHOR: ${diff.author}
DATE: ${diff.date}
TOTAL: +${diff.totalAdditions}/-${diff.totalDeletions} lines across ${diff.files.length} file(s)

FILES CHANGED:
${fileList}

DIFF:
${diffContent}

Read the project source code using your tools to understand the codebase before analyzing.
Respond with ONLY valid JSON (no markdown, no code fences):
{ "needsTests": true/false, "reason": "brief explanation", "scope": "optional test scope or null" }`;

    const output = await analyzeCommit(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath, userMessage,
      ctx.projectName
    );

    let analysis: CommitAnalysis;
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]) as CommitAnalysis;
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      analysis = { needsTests: true, reason: "Could not parse analysis, defaulting to generate tests", scope: null };
    }

    ctx.commitAnalysis = analysis;

    if (!analysis.needsTests) {
      logger.info(`Skipping commit ${shortSha}: ${analysis.reason}`);
      record(ctx, "triage_commit", "agent_commit_analyzer", output, "stop");
      return { action: "stop", reason: `Commit triage: ${analysis.reason}` };
    }

    record(ctx, "triage_commit", "agent_commit_analyzer", output, "next");
    return { action: "next" };
  };
}

export function adaptBranchSetup(): StepFunction {
  return async (ctx) => {
    if (ctx.mode === "issue" && ctx.issue) {
      await ctx.git.createAndCheckout(ctx.branchName!, ctx.baseBranch!);
    } else if (ctx.mode === "commit" && ctx.commitDiff) {
      const shortSha = ctx.commitDiff.sha.slice(0, 7);
      ctx.branchName = `test/commit-${shortSha}`;
      await ctx.git.createAndCheckout(ctx.branchName, ctx.baseBranch!);
    } else {
      return { action: "stop", reason: "Missing issue or commitDiff for branch setup" };
    }

    logger.success(`Branch ready: ${ctx.branchName}`);
    record(ctx, "setup_branch", undefined, `Created branch ${ctx.branchName} from ${ctx.baseBranch}`, "next");
    return { action: "next" };
  };
}

export function adaptTestGenerator(): StepFunction {
  return async (ctx) => {
    let testFilename: string;
    if (ctx.mode === "issue" && ctx.issue) {
      testFilename = `issue-${ctx.issue.number}-${GitBranch.slugify(ctx.issue.title)}.spec.ts`;
    } else if (ctx.mode === "commit" && ctx.commitDiff) {
      testFilename = `commit-${ctx.commitDiff.sha.slice(0, 7)}.spec.ts`;
    } else {
      return { action: "stop", reason: "Cannot determine test filename" };
    }

    ctx.testFilename = testFilename;

    let userMessage: string;
    if (ctx.mode === "issue" && ctx.issue && ctx.issueAnalysis) {
      const scenarios = ctx.issueAnalysis.test_scenarios
        .map((s, i) => `${i + 1}. ${s.name} (${s.type}): ${s.description}`)
        .join("\n");
      const acceptanceCriteria = ctx.issueAnalysis.test_scenarios
        .filter((s) => s.acceptance_criterion)
        .map((s) => `- ${s.acceptance_criterion}`)
        .join("\n");

      userMessage = `Generate a Playwright E2E test file for this issue.

ISSUE: #${ctx.issue.number} — ${ctx.issue.title}
DESCRIPTION: ${ctx.issue.body}

ANALYSIS:
Summary: ${ctx.issueAnalysis.summary}
Functionality to test: ${ctx.issueAnalysis.functionality_to_test.join(", ")}
Relevant files: ${ctx.issueAnalysis.relevant_files.join(", ")}
API endpoints: ${ctx.issueAnalysis.api_endpoints.join(", ")}
Role checks: ${ctx.issueAnalysis.role_checks.join(", ")}
Edge cases: ${ctx.issueAnalysis.edge_cases.join(", ")}

TEST SCENARIOS:
${scenarios}

ACCEPTANCE CRITERIA (each MUST have a test case):
${acceptanceCriteria || "(none specified)"}

FILENAME: ${testFilename}
IMPORTANT: Use the write_test_file tool to save the test as "${testFilename}".`;
    } else if (ctx.mode === "commit" && ctx.commitDiff) {
      const diff = ctx.commitDiff;
      const shortSha = diff.sha.slice(0, 7);
      const changedFilesContext = diff.files
        .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
        .join("\n");
      const commitContext = `## COMMIT: ${shortSha} — ${diff.message.split("\n")[0]}

**Author:** ${diff.author}
**Changed files:**
${changedFilesContext}

**Test scope suggestion:** ${ctx.commitAnalysis?.scope ?? "General E2E testing of changed functionality"}

**Diff details:**
${diff.files.map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch ?? "(no patch)"}\n\`\`\``).join("\n\n")}`;

      userMessage = `Generate a Playwright E2E test file for this commit.\n\nFilename: ${testFilename}\n\nScope: ${ctx.commitAnalysis?.scope ?? "General E2E testing"}\n\nCommit Context:\n${commitContext}\n\nIMPORTANT: Use the write_test_file tool to save the test as "${testFilename}".`;
    } else {
      return { action: "stop", reason: "No analysis data available for test generation" };
    }

    await generateTests(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath, userMessage,
      ctx.projectName
    );

    record(ctx, "generate_tests", "agent_tests_generator", `Generated ${testFilename}`, "next");
    return { action: "next" };
  };
}

export function adaptRunTests(): StepFunction {
  return async (ctx) => {
    if (!ctx.testFilename) {
      return { action: "stop", reason: "No test filename set" };
    }

    const result = await runTests(ctx.runner, ctx.testFilename);
    ctx.testResult = result;

    logger[result.success ? "success" : "error"](
      `${result.passed}/${result.total} tests ${result.success ? "passed" : "failed"}`
    );

    if (result.success) {
      record(ctx, "run_tests", undefined, `${result.passed}/${result.total} passed`, "next");
      return { action: "next" };
    }

    if (ctx.retries < ctx.maxRetries && result.errors.length > 0) {
      record(ctx, "run_tests", undefined, `${result.passed}/${result.total} passed`, "retry");
      return { action: "retry", step: "review_and_fix", reason: result.errors.join("\n") };
    }

    record(ctx, "run_tests", undefined, `${result.passed}/${result.total} passed (retries exhausted)`, "next");
    return { action: "next" };
  };
}

export function adaptReviewAndFix(): StepFunction {
  return async (ctx) => {
    if (!ctx.testFilename || !ctx.testResult) {
      return { action: "stop", reason: "Missing test filename or test result" };
    }

    const testContent = ctx.testReader.readFile(ctx.testFilename);
    ctx.testContent = testContent;
    const errorContext = ctx.testResult.errors.join("\n\n");

    await reviewTests(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath,
      ctx.testFilename,
      testContent,
      `Fix the failing test. Here are the errors:\n\n${errorContext}`
    );

    record(ctx, "review_fix", "agent_tests_reviewer", `Fixed ${ctx.testFilename}`, "goto:run_tests");
    return { action: "goto", step: "run_tests" };
  };
}

export function adaptReportGenerator(): StepFunction {
  return async (ctx) => {
    if (!ctx.testResult) {
      return { action: "next" };
    }

    const output = await generateTestReport(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath, ctx.testResult
    );

    ctx.report = output;
    record(ctx, "generate_report", "agent_tests_report_generator", output, "next");
    return { action: "next" };
  };
}

export function adaptCommitAndPush(): StepFunction {
  return async (ctx) => {
    let commitMessage: string;
    if (ctx.mode === "issue" && ctx.issue) {
      commitMessage = `test: auto-generated E2E tests for issue #${ctx.issue.number}`;
    } else if (ctx.mode === "commit" && ctx.commitDiff) {
      commitMessage = `test: auto-generated E2E tests for commit ${ctx.commitDiff.sha.slice(0, 7)}`;
    } else {
      commitMessage = "test: auto-generated E2E tests";
    }

    await ctx.git.commitAndPush(commitMessage, ctx.branchName!);
    record(ctx, "commit_push", undefined, `Pushed to ${ctx.branchName}`, "next");
    return { action: "next" };
  };
}

export function adaptCreatePR(): StepFunction {
  return async (ctx) => {
    if (!ctx.githubClient) {
      return { action: "next" };
    }

    let title: string;
    let body: string;

    if (ctx.mode === "issue" && ctx.issue) {
      title = `test: E2E tests for issue #${ctx.issue.number}`;
      body = `## Automated Test Generation\n\n**Issue:** #${ctx.issue.number} — ${ctx.issue.title}\n\n### Test Results\n${ctx.testResult ? formatTestReport(ctx.testResult) : "(no results)"}\n\n### Files Changed\n- \`tests/e2e/${ctx.testFilename}\` (new)\n\n### How to Run\n\`\`\`bash\nnpx playwright test tests/e2e/${ctx.testFilename}\n\`\`\`\n\n---\n*Generated by ${ctx.projectName} Test Agent*`;
    } else if (ctx.mode === "commit" && ctx.commitDiff) {
      const shortSha = ctx.commitDiff.sha.slice(0, 7);
      const changedFilesContext = ctx.commitDiff.files
        .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
        .join("\n");
      title = `test: E2E tests for commit ${shortSha}`;
      body = `## Automated Test Generation\n\n**Commit:** ${shortSha} — ${ctx.commitDiff.message.split("\n")[0]}\n**Author:** ${ctx.commitDiff.author}\n\n### Analysis\n${ctx.commitAnalysis?.reason ?? "N/A"}\n\n### Test Results\n${ctx.testResult ? formatTestReport(ctx.testResult) : "(no results)"}\n\n### Files Changed in Commit\n${changedFilesContext}\n\n### Test File Added\n- \`tests/e2e/${ctx.testFilename}\`\n\n### How to Run\n\`\`\`bash\nnpx playwright test tests/e2e/${ctx.testFilename}\n\`\`\`\n\n---\n*Generated by ${ctx.projectName} Test Agent*`;
    } else {
      return { action: "next" };
    }

    await ctx.githubClient.createPR({
      title,
      body,
      head: ctx.branchName!,
      base: ctx.baseBranch!,
    });

    record(ctx, "create_pr", undefined, `PR created for ${ctx.branchName}`, "next");
    return { action: "next" };
  };
}

export function adaptSummarize(): StepFunction {
  return async (ctx) => {
    let userMessage: string;

    if (ctx.mode === "issue" && ctx.issue) {
      userMessage = `Summarize these test results for a GitHub comment:\n\nIssue: #${ctx.issue.number} — ${ctx.issue.title}\nBranch: ${ctx.branchName}\nTest file: ${ctx.testFilename}\n\nTest Results:\n${ctx.testResult ? formatTestReport(ctx.testResult) : "(no results)"}\n\nReport:\n${ctx.report ?? "(no report)"}`;
    } else if (ctx.mode === "commit" && ctx.commitDiff) {
      const shortSha = ctx.commitDiff.sha.slice(0, 7);
      userMessage = `Summarize these test results for a GitHub comment:\n\nCommit: ${shortSha} — ${ctx.commitDiff.message.split("\n")[0]}\nBranch: ${ctx.branchName}\nTest file: ${ctx.testFilename}\n\nTest Results:\n${ctx.testResult ? formatTestReport(ctx.testResult) : "(no results)"}\n\nReport:\n${ctx.report ?? "(no report)"}`;
    } else {
      return { action: "next" };
    }

    const output = await summarizeResults(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath, userMessage
    );

    ctx.summary = output;

    if (ctx.githubClient && ctx.issue) {
      await ctx.githubClient.addComment(ctx.issue.number, output);
    }

    record(ctx, "summarize", "agent_summarize", output, "done");
    return { action: "done" };
  };
}
