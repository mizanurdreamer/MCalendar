import type { StepDefinition, SharedContext } from "./shared_context.js";
import {
  adaptIssueAnalyzer,
  adaptCommitAnalyzer,
  adaptBranchSetup,
  adaptTestGenerator,
  adaptRunTests,
  adaptReviewAndFix,
  adaptReportGenerator,
  adaptCommitAndPush,
  adaptCreatePR,
  adaptSummarize,
} from "./step_adapters.js";

export function getIssuePipeline(): StepDefinition[] {
  return [
    { name: "analyze_issue",    run: adaptIssueAnalyzer() },
    { name: "setup_branch",     run: adaptBranchSetup() },
    { name: "generate_tests",   run: adaptTestGenerator() },
    { name: "run_tests",        run: adaptRunTests() },
    { name: "review_and_fix",   run: adaptReviewAndFix(),  condition: (ctx: SharedContext) => !!ctx.testResult && !ctx.testResult.success && ctx.retries < ctx.maxRetries },
    { name: "generate_report",  run: adaptReportGenerator() },
    { name: "commit_push",      run: adaptCommitAndPush() },
    { name: "create_pr",        run: adaptCreatePR() },
    { name: "summarize",        run: adaptSummarize() },
  ];
}

export function getCommitPipeline(): StepDefinition[] {
  return [
    { name: "triage_commit",    run: adaptCommitAnalyzer() },
    { name: "setup_branch",     run: adaptBranchSetup() },
    { name: "generate_tests",   run: adaptTestGenerator() },
    { name: "run_tests",        run: adaptRunTests() },
    { name: "review_and_fix",   run: adaptReviewAndFix(),  condition: (ctx: SharedContext) => !!ctx.testResult && !ctx.testResult.success && ctx.retries < ctx.maxRetries },
    { name: "generate_report",  run: adaptReportGenerator() },
    { name: "commit_push",      run: adaptCommitAndPush() },
    { name: "create_pr",        run: adaptCreatePR() },
    { name: "summarize",        run: adaptSummarize() },
  ];
}
