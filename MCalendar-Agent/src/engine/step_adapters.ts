import type { SharedContext, StepFunction, CommitAnalysis, IssueAnalysis } from "./shared_context.js";
import { analyzeIssue } from "../agent/agent_issue_analyzer.js";
import { analyzeCommit } from "../agent/agent_commit_analyzer.js";
import { generateTests } from "../agent/agent_tests_generator.js";
import { analyzeTestError, reviewTests } from "../agent/agent_tests_reviewer.js";
import { generateTestReport } from "../agent/agent_tests_report_generator.js";
import { summarizeResults } from "../agent/agent_summarize.js";
import { runTests } from "../test_runner/tests_runner.js";
import { formatTestReport } from "../test_runner/reporter.js";
import { GitBranch } from "../github/git_operations.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import fs from "node:fs";
import path from "node:path";

function record(ctx: SharedContext, name: string, agent: string | undefined, output: string, decision: string) {
  ctx.stepHistory.push({
    name,
    timestamp: Date.now(),
    agent,
    output: output.slice(0, 200),
    decision,
  });
}

async function discoverProjectContext(ctx: SharedContext): Promise<void> {
  if (ctx.projectContext) return;

  let tree = "";
  try { tree = ctx.reader.getProjectStructure(); } catch { /* ignore */ }

  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(ctx.reader.readFile("package.json"));
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch { /* ignore */ }

  let dataModels = "";
  try { dataModels = ctx.reader.readFile("prisma/schema.prisma"); } catch { /* ignore */ }

  let apiRoutes: string[] = [];
  try { apiRoutes = ctx.reader.getApiRoutes(); } catch { /* ignore */ }

  let existingTestPatterns = "";
  let testUtils = "";
  try {
    const testFiles = ctx.testReader.listDirectory("tests");
    const sampleFiles = testFiles.filter(f => f.endsWith(".spec.ts") || f.endsWith(".test.ts")).slice(0, 3);
    for (const f of sampleFiles) {
      existingTestPatterns += `\n--- ${f} ---\n${ctx.testReader.readFile(`tests/${f}`)}`;
    }
    try {
      testUtils = ctx.testReader.readFile("tests/utils/token.ts");
    } catch {
      try { testUtils = ctx.testReader.readFile("tests/utils/index.ts"); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  const depsStr = Object.entries(deps).map(([k, v]) => `${k}: ${v}`).join(", ") || "none";

  const userMessage = `Map this project and return a JSON object. The file tree and dependencies are provided below. You may use read_file or list_directory to inspect key files if needed.

PROJECT FILE TREE:
${tree}

DEPENDENCIES:
${depsStr}

Return ONLY valid JSON with this exact shape:
{
  "language": "typescript|python|go|java|rust|other",
  "framework": "nextjs|react|express|vue|angular|django|flask|fastapi|spring|gin|other",
  "testRunner": "playwright|jest|vitest|pytest|junit|go test|cargo test|other",
  "packageManager": "npm|yarn|pnpm|pip|poetry|go|cargo|maven|gradle|other",
  "buildTool": "next|vite|webpack|tsc|go build|cargo build|maven|gradle|other",
  "dataModels": "describe ORM/model files found",
  "apiRoutes": ["list API route patterns found"],
  "pageRoutes": ["list page/view routes found"],
  "testDirectories": ["tests/", "e2e/", "__tests__/"]
}`;

  try {
    const provider = getTaskProvider(AGENT_NAMES.ISSUE_ANALYZER, ctx.agentConfig);
    logger.task("discover_project", `${getTaskProviderName(AGENT_NAMES.ISSUE_ANALYZER, ctx.agentConfig)}/${getTaskModel(AGENT_NAMES.ISSUE_ANALYZER, ctx.agentConfig)}`);

    const response = await provider.chat({
      system: "You are a codebase cartographer. Map ANY stack (JS/TS/Python/Java/Go/Rust). Inspect key files to identify framework, test runner, ORM, and route patterns. Output ONLY valid JSON.",
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 4096,
      temperature: 0.2,
    });

    const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    const raw = textBlocks.map((b) => b.text).join("\n");
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const d = JSON.parse(jsonMatch[0]);
      ctx.projectContext = {
        framework: d.framework || "unknown",
        testRunner: d.testRunner || "unknown",
        dependencies: d.dependencies || deps,
        dataModels: d.dataModels || dataModels,
        apiRoutes: Array.isArray(d.apiRoutes) ? d.apiRoutes : apiRoutes,
        projectStructure: tree,
        existingTestPatterns,
        testUtils,
      };
      logger.success(`[discover] ${d.language}/${d.framework}/${d.testRunner}`);
      return;
    }
  } catch (err) {
    logger.warn(`[discover] LLM discovery failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let framework = "unknown";
  let testRunner = "playwright";
  if (deps.next) framework = "nextjs";
  else if (deps.react) framework = "react";
  else if (deps.vue) framework = "vue";
  else if (deps["@angular/core"]) framework = "angular";
  else if (deps.svelte) framework = "svelte";
  if (deps["@playwright/test"]) testRunner = "playwright";
  else if (deps.vitest) testRunner = "vitest";
  else if (deps.jest) testRunner = "jest";

  ctx.projectContext = {
    framework,
    testRunner,
    dependencies: deps,
    dataModels,
    apiRoutes,
    projectStructure: tree,
    existingTestPatterns,
    testUtils,
  };
  logger.info(`[discover] Fallback: ${framework}/${testRunner}`);
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

    await discoverProjectContext(ctx);

    const issue = ctx.issue;
    const userMessage = `Issue #${issue.number}: ${issue.title}

${issue.body ?? "(no description)"}`;

    const output = await analyzeIssue(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath, userMessage,
      ctx.projectName,
      ctx.maxIterations,
      ctx
    );

    const analysis = parseIssueAnalysis(output);
    ctx.issueAnalysis = analysis;

    if (!analysis.needs_tests) {
      logger.info(`Issue #${issue.number}: ${analysis.summary}`);
      record(ctx, "analyze_issue", AGENT_NAMES.ISSUE_ANALYZER, analysis.summary, "goto:summarize");
      return { action: "goto", step: "summarize" };
    }

    if (analysis.test_scenarios.length === 0) {
      logger.warn(`Issue #${issue.number}: Analysis returned no test scenarios`);
      record(ctx, "analyze_issue", AGENT_NAMES.ISSUE_ANALYZER, "No test scenarios identified", "goto:summarize");
      return { action: "goto", step: "summarize" };
    }

    logger.info(`Issue #${issue.number}: ${analysis.test_scenarios.length} test scenarios identified`);
    record(ctx, "analyze_issue", AGENT_NAMES.ISSUE_ANALYZER, analysis.summary, "next");
    return { action: "next" };
  };
}

export function adaptCommitAnalyzer(): StepFunction {
  return async (ctx) => {
    if (!ctx.commitDiff) {
      return { action: "stop", reason: "No commit diff provided" };
    }

    await discoverProjectContext(ctx);

    const diff = ctx.commitDiff;
    const shortSha = diff.sha.slice(0, 7);

    const fileList = diff.files
      .map((f) => `  ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
      .join("\n");

    const userMessage = `Commit ${shortSha}: ${diff.message}

Files changed:
${fileList}`;

    const output = await analyzeCommit(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath, userMessage,
      ctx.projectName,
      ctx.maxIterations,
      ctx
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
      record(ctx, "triage_commit", AGENT_NAMES.COMMIT_ANALYZER, output, "goto:summarize");
      return { action: "goto", step: "summarize" };
    }

    record(ctx, "triage_commit", AGENT_NAMES.COMMIT_ANALYZER, output, "next");
    return { action: "next" };
  };
}

export function adaptPlanning(): StepFunction {
  return async (ctx) => {
    if (!ctx.issueAnalysis && !ctx.commitAnalysis) {
      record(ctx, "plan", undefined, "Skipped (no analysis)", "next");
      return { action: "next" };
    }

    const analysis = ctx.issueAnalysis ?? ctx.commitAnalysis;
    const input = ctx.issue
      ? `ISSUE #${ctx.issue.number}: ${ctx.issue.title}\nDESCRIPTION:\n${ctx.issue.body ?? "(no description)"}\n\nANALYSIS:\n${JSON.stringify(analysis, null, 2)}`
      : ctx.commitDiff
        ? `COMMIT: ${ctx.commitDiff.sha.slice(0, 7)} — ${ctx.commitDiff.message}\nANALYSIS:\n${JSON.stringify(analysis, null, 2)}`
        : "No analysis available";

    const prompt = `You are a test planning agent. Given the following analysis, produce a structured test plan.

${input}

Return a JSON object with this shape:
{
  "plan_summary": "one sentence summary",
  "test_areas": ["area1", "area2"],
  "key_assertions": ["assertion1", "assertion2"],
  "risk_areas": ["risk1", "risk2"],
  "estimated_test_count": 3
}`;

    const { getTaskProvider, getTaskProviderName, getTaskModel } = await import("../providers/registry.js");
    const provider = getTaskProvider(AGENT_NAMES.ISSUE_ANALYZER, ctx.agentConfig);
    logger.task("test_planner", `${getTaskProviderName(AGENT_NAMES.ISSUE_ANALYZER, ctx.agentConfig)}/${getTaskModel(AGENT_NAMES.ISSUE_ANALYZER, ctx.agentConfig)}`);

    const response = await provider.chat({
      system: "You are a focused test planning agent. Output only valid JSON.",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1024,
      temperature: 0.3,
    });

    const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    const planOutput = textBlocks.map((b) => b.text).join("\n");
    logger.prompt("test_planner", "You are a focused test planning agent. Output only valid JSON.", prompt, planOutput);

    ctx.planResult = planOutput;
    record(ctx, "plan", "test_planner", planOutput.slice(0, 200), "next");
    logger.info(`Plan: ${planOutput.slice(0, 120)}...`);
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
    if (ctx.projectContext) {
      try { ctx.projectContext.projectStructure = ctx.reader.getProjectStructure(); } catch { /* ignore */ }
    }

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
        .map((s, i) => `${i + 1}. ${s.name} (${s.type}): ${s.description}${s.acceptance_criterion ? ` [criteria: ${s.acceptance_criterion}]` : ""}`)
        .join("\n");

      userMessage = `Write a Playwright E2E test file for this issue.

Issue #${ctx.issue.number}: ${ctx.issue.title}
${ctx.issue.body ?? ""}

TEST SCENARIOS (write one test case per scenario):
${scenarios || "(no scenarios — generate based on the issue)"}

Use read_file/list_directory to explore source files as needed.
Use the write_test_file tool to save the test as "${testFilename}".`;
    } else if (ctx.mode === "commit" && ctx.commitDiff) {
      const diff = ctx.commitDiff;
      const shortSha = diff.sha.slice(0, 7);
      const changedFiles = diff.files.map((f) => `  ${f.filename} (${f.status})`).join("\n");

      userMessage = `Write a Playwright E2E test file for this commit.

Commit ${shortSha}: ${diff.message}
Scope: ${ctx.commitAnalysis?.scope ?? "General E2E testing"}

Files changed:
${changedFiles}

Use read_file/list_directory to explore source files as needed.
Use the write_test_file tool to save the test as "${testFilename}".`;
    } else {
      return { action: "stop", reason: "No analysis data available for test generation" };
    }

    await generateTests(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath, userMessage,
      ctx.projectName,
      ctx.maxIterations,
      ctx
    );

    record(ctx, "generate_tests", AGENT_NAMES.TESTS_GENERATOR, `Generated ${testFilename}`, "next");
    return { action: "next" };
  };
}

export function adaptRunTests(): StepFunction {
  return async (ctx) => {
    if (!ctx.testFilename) {
      logger.warn("[run_tests] No test filename set");
      return { action: "goto", step: "summarize" };
    }

    const testFile = path.join(ctx.testOutputPath, ctx.testFilename);
    if (!fs.existsSync(testFile)) {
      logger.warn(`[run_tests] Test file not found: ${testFile}`);
      return { action: "goto", step: "summarize" };
    }

    logger.info(`[run_tests] Running test: ${ctx.testFilename}`);
    const result = await runTests(ctx.runner, ctx.testFilename);
    ctx.testResult = result;

    if (result.success) {
      logger.success(`[run_tests] ${result.passed}/${result.total} tests passed`);
      record(ctx, "run_tests", undefined, `${result.passed}/${result.total} passed`, "next");
      return { action: "next" };
    }

    logger.error(`[run_tests] ${result.passed}/${result.total} tests failed`);
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        logger.error(`[run_tests] Error: ${err.slice(0, 500)}`);
      }
    } else {
      logger.warn("[run_tests] Tests failed but no error messages captured");
      const tail = result.output.slice(-2000).replace(/\x1B\[[0-9;]*m/g, "");
      if (tail) result.errors.push(tail);
    }

    if (ctx.retries < ctx.maxRetries && result.errors.length > 0) {
      record(ctx, "run_tests", undefined, `${result.passed}/${result.total} passed`, "retry");
      return { action: "retry", step: "review_and_fix", reason: result.errors.join("\n") };
    }

    logger.error(`[run_tests] Max retries (${ctx.maxRetries}) exhausted — tests still failing`);
    record(ctx, "run_tests", undefined, `${result.passed}/${result.total} passed (retries exhausted)`, "next");
    return { action: "next" };
  };
}

export function adaptReviewAndFix(): StepFunction {
  return async (ctx) => {
    if (!ctx.testFilename || !ctx.testResult) {
      return { action: "stop", reason: "Missing test filename or test result" };
    }

    if (ctx.testResult.success) {
      return { action: "next" };
    }

    if (ctx.projectContext) {
      try { ctx.projectContext.projectStructure = ctx.reader.getProjectStructure(); } catch { /* ignore */ }
    }

    logger.info(`[review] Starting review_and_fix for ${ctx.testFilename} (attempt ${ctx.retries + 1}/${ctx.maxRetries})`);
    logger.info(`[review] Errors: ${ctx.testResult.errors.length}`);

    const testContent = ctx.testReader.readFile(ctx.testFilename);
    ctx.testContent = testContent;

    // Step 1: Analyze the error first
    const analysis = await analyzeTestError(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath,
      ctx.testFilename,
      testContent,
      ctx.testResult.errors,
      ctx.retryHistory,
      ctx.projectName,
      ctx.maxIterations,
      ctx
    );

    // Track this retry attempt
    ctx.retryHistory.push({
      attempt: ctx.retries,
      errors: ctx.testResult.errors,
      analysis,
    });

    logger.info(`[review] Retry history updated: attempt ${ctx.retries}`);

    // Step 2: Fix the test based on analysis
    await reviewTests(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath,
      ctx.testFilename,
      testContent,
      ctx.testResult.errors,
      `Fix the test based on this analysis:\n\n${analysis}`,
      ctx.projectName,
      ctx.maxIterations,
      ctx
    );

    logger.info(`[review] Fix applied, re-running tests`);
    record(ctx, "review_fix", AGENT_NAMES.TESTS_REVIEWER, `Fixed ${ctx.testFilename} (attempt ${ctx.retries})`, "goto:run_tests");
    return { action: "goto", step: "run_tests" };
  };
}

function saveReportFile(ctx: SharedContext, report: string): string | undefined {
  try {
    const reportsDir = path.resolve("reports");
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    let filename: string;
    if (ctx.mode === "issue" && ctx.issue) {
      filename = `issue-${ctx.issue.number}-${date}.md`;
    } else if (ctx.mode === "commit" && ctx.commitDiff) {
      filename = `commit-${ctx.commitDiff.sha.slice(0, 7)}-${date}.md`;
    } else {
      filename = `report-${date}-${Date.now()}.md`;
    }

    const filePath = path.join(reportsDir, filename);
    const htmlPath = ctx.testResult?.htmlReportPath;
    const htmlNote = htmlPath
      ? `\n\n---\n*Playwright HTML report: \`${htmlPath}\` — view with \`npx playwright show-report\` from the test project.*`
      : "";
    fs.writeFileSync(filePath, `# Test Report — ${new Date().toISOString()}\n\n${report}${htmlNote}\n`, "utf-8");
    logger.success(`Report saved to ${filePath}`);
    return filePath;
  } catch (err) {
    logger.warn(`Failed to save report file: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

export function adaptReportGenerator(): StepFunction {
  return async (ctx) => {
    if (!ctx.testResult) {
      return { action: "next" };
    }

    const output = await generateTestReport(
      ctx.agentConfig, ctx.reader, ctx.runner,
      ctx.testOutputPath, ctx.codebasePath, ctx.testResult,
      ctx.projectName,
      ctx.maxIterations,
      ctx.maxRetries
    );

    ctx.report = output;
    ctx.reportPath = saveReportFile(ctx, output);
    record(ctx, "generate_report", AGENT_NAMES.TESTS_REPORT_GENERATOR, output, "next");
    return { action: "next" };
  };
}

export function adaptCommitAndPush(): StepFunction {
  return async (ctx) => {
    if (!ctx.testFilename) {
      record(ctx, "commit_push", undefined, "Skipped (no test file)", "next");
      return { action: "next" };
    }

    if (!ctx.commitAutoApprove) {
      logger.info("COMMIT_AUTO_APPROVE=false — skipping push");
      record(ctx, "commit_push", undefined, "Skipped (commit auto-approve disabled)", "next");
      return { action: "next" };
    }

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
    if (!ctx.githubClient || !ctx.testFilename) {
      return { action: "next" };
    }

    let title: string;
    let body: string;

    if (ctx.mode === "issue" && ctx.issue) {
      title = `test: E2E tests for issue #${ctx.issue.number}`;
      body = `## Automated Test Generation\n\n**Issue:** #${ctx.issue.number} — ${ctx.issue.title}\n\n### Test Results\n${ctx.testResult ? formatTestReport(ctx.testResult) : "(no results)"}\n\n### Files Changed\n- \`tests/${ctx.testFilename}\` (new)\n\n### How to Run\n\`\`\`bash\nnpx playwright test tests/${ctx.testFilename}\n\`\`\`${ctx.report ? `\n\n### Detailed Report\n\n${ctx.report}` : ""}\n\n---\n*Generated by ${ctx.projectName} Test Agent*`;
    } else if (ctx.mode === "commit" && ctx.commitDiff) {
      const shortSha = ctx.commitDiff.sha.slice(0, 7);
      const changedFilesContext = ctx.commitDiff.files
        .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
        .join("\n");
      title = `test: E2E tests for commit ${shortSha}`;
      body = `## Automated Test Generation\n\n**Commit:** ${shortSha} — ${ctx.commitDiff.message.split("\n")[0]}\n**Author:** ${ctx.commitDiff.author}\n\n### Analysis\n${ctx.commitAnalysis?.reason ?? "N/A"}\n\n### Test Results\n${ctx.testResult ? formatTestReport(ctx.testResult) : "(no results)"}\n\n### Files Changed in Commit\n${changedFilesContext}\n\n### Test File Added\n- \`tests/${ctx.testFilename}\`\n\n### How to Run\n\`\`\`bash\nnpx playwright test tests/${ctx.testFilename}\n\`\`\`${ctx.report ? `\n\n### Detailed Report\n\n${ctx.report}` : ""}\n\n---\n*Generated by ${ctx.projectName} Test Agent*`;
    } else {
      return { action: "next" };
    }

    const pr = await ctx.githubClient.createPR({
      title,
      body,
      head: ctx.branchName!,
      base: ctx.baseBranch!,
      draft: !ctx.commitAutoApprove,
    });

    if (pr.html_url) {
      ctx.prUrl = pr.html_url;
    }

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
      ctx.testOutputPath, ctx.codebasePath, userMessage,
      ctx.projectName,
      ctx.maxIterations,
      ctx.maxRetries
    );

    ctx.summary = output;

    if (ctx.githubClient && ctx.issue) {
      await ctx.githubClient.addComment(ctx.issue.number, output);
    } else if (ctx.githubClient && ctx.mode === "commit" && ctx.prUrl) {
      await ctx.githubClient.addPRComment(ctx.prUrl, output);
    }

    record(ctx, "summarize", AGENT_NAMES.SUMMARIZE, output, "done");
    return { action: "done" };
  };
}
