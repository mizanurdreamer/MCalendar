import { Command } from "commander";
import { loadConfig } from "./config/index.js";
import { GitHubClient } from "./github/client.js";
import { processIssue } from "./orchestrator/issue_orchestrator.js";
import { processCommit } from "./orchestrator/commit_orchestrator.js";
import { startWatcher } from "./watcher/issue_orchestrator_watcher.js";
import { StateManager } from "./watcher/issue_state_tracker.js";
import { CommitStateManager } from "./watcher/commit_state_tracker.js";
import { startWebServer } from "./server/http.js";
import { logger } from "./utils/logger.js";

const program = new Command();

program
  .name("mcalendar-agent")
  .description("MCalendar Multi-AI Test Agent")
  .version("1.0.0");

program
  .command("issue")
  .description("Process a specific GitHub issue")
  .argument("<number>", "Issue number to process")
  .action(async (numberStr: string) => {
    try {
      const config = loadConfig();
      if (!config.agentEnabled) {
        logger.info("Agent is disabled (AGENT_ENABLED=false). Exiting.");
        return;
      }
      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName, config.githubMaxRetries);

      const issueNumber = parseInt(numberStr, 10);
      if (isNaN(issueNumber)) throw new Error(`Invalid issue number: ${numberStr}`);

      const issue = await github.getIssue(issueNumber);

      logger.banner([
        "🤖 MCalendar Multi-AI Test Agent",
        `Processing issue #${issue.number}: ${issue.title}`,
      ]);

      const result = await processIssue(issue, {
        agentConfig: config.agentConfig,
        githubClient: github,
        codebasePath: config.codebasePath,
        testProjectPath: config.testProjectPath,
        maxRetries: config.maxRetries,
        maxIterations: config.maxIterations,
        maxPipelineSteps: config.maxPipelineSteps,
        projectName: config.projectName,
        databaseUrl: config.databaseUrl,
        apiBaseUrl: config.apiBaseUrl,
        commitAutoApprove: config.commitAutoApprove,
      });

      logger.success(`\n✅ Done — ${result.output}`);
    } catch (err) {
      logger.error(`Error: ${err}`);
      process.exit(1);
    }
  });

program
  .command("commit")
  .description("Process a specific commit SHA")
  .argument("<sha>", "Commit SHA to process")
  .option("-b, --branch <branch>", "Target branch to merge into")
  .action(async (sha: string, opts: { branch?: string }) => {
    try {
      const config = loadConfig();
      if (!config.agentEnabled) {
        logger.info("Agent is disabled (AGENT_ENABLED=false). Exiting.");
        return;
      }
      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName, config.githubMaxRetries);

      const targetBranch = opts.branch ?? config.watchBranch ?? await github.getDefaultBranch();

      logger.banner([
        "🤖 MCalendar Multi-AI Test Agent",
        `Processing commit ${sha.slice(0, 7)}`,
      ]);

      const diff = await github.getCommitDiff(sha);

      const result = await processCommit(diff, {
        agentConfig: config.agentConfig,
        githubClient: github,
        codebasePath: config.codebasePath,
        testProjectPath: config.testProjectPath,
        maxRetries: config.maxRetries,
        maxIterations: config.maxIterations,
        maxPipelineSteps: config.maxPipelineSteps,
        targetBranch,
        projectName: config.projectName,
        databaseUrl: config.databaseUrl,
        apiBaseUrl: config.apiBaseUrl,
        commitAutoApprove: config.commitAutoApprove,
      });

      if (result.skipped) {
        logger.info(`Skipped: ${result.analysis?.reason}`);
      } else {
        logger.success(`\n✅ Done — ${result.output}`);
      }
    } catch (err) {
      logger.error(`Error: ${err}`);
      process.exit(1);
    }
  });

program
  .command("watch")
  .description("Watch for new GitHub issues (and optionally commits) and auto-process them")
  .option("-i, --poll-interval <minutes>", "Polling interval in minutes")
  .option("-b, --branch <branch>", "Also watch commits on this branch")
  .action(async (opts: { pollInterval?: string; branch?: string }) => {
    try {
      const config = loadConfig();
      if (!config.agentEnabled) {
        logger.info("Agent is disabled (AGENT_ENABLED=false). Exiting.");
        return;
      }
      const pollInterval = opts.pollInterval ? parseInt(opts.pollInterval, 10) : config.pollIntervalMin;
      const watchBranch = opts.branch ?? config.watchBranch;

      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName, config.githubMaxRetries);

      await startWatcher({
        agentConfig: config.agentConfig,
        githubClient: github,
        codebasePath: config.codebasePath,
        testProjectPath: config.testProjectPath,
        maxRetries: config.maxRetries,
        maxIterations: config.maxIterations,
        maxPipelineSteps: config.maxPipelineSteps,
        runMaxRetries: config.runMaxRetries,
        pollIntervalMin: pollInterval,
        stateDir: "state",
        watchBranch,
        projectName: config.projectName,
        databaseUrl: config.databaseUrl,
        apiBaseUrl: config.apiBaseUrl,
        commitAutoApprove: config.commitAutoApprove,
      });
    } catch (err) {
      logger.error(`Error: ${err}`);
      process.exit(1);
    }
  });

program
  .command("watch-branch")
  .description("Watch a branch for new commits and auto-generate E2E tests")
  .argument("[branch]", "Branch name to watch (defaults to WATCH_BRANCH env or repo default)")
  .option("-i, --poll-interval <minutes>", "Polling interval in minutes")
  .action(async (branchArg: string | undefined, opts: { pollInterval?: string }) => {
    try {
      const config = loadConfig();
      if (!config.agentEnabled) {
        logger.info("Agent is disabled (AGENT_ENABLED=false). Exiting.");
        return;
      }
      const pollInterval = opts.pollInterval ? parseInt(opts.pollInterval, 10) : config.pollIntervalMin;

      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName, config.githubMaxRetries);

      const watchBranch = branchArg ?? config.watchBranch;
      if (!watchBranch) {
        throw new Error("No branch specified. Pass a branch name or set WATCH_BRANCH in .env");
      }

      await startWatcher({
        agentConfig: config.agentConfig,
        githubClient: github,
        codebasePath: config.codebasePath,
        testProjectPath: config.testProjectPath,
        maxRetries: config.maxRetries,
        maxIterations: config.maxIterations,
        maxPipelineSteps: config.maxPipelineSteps,
        runMaxRetries: config.runMaxRetries,
        pollIntervalMin: pollInterval,
        stateDir: "state",
        watchBranch,
        projectName: config.projectName,
        databaseUrl: config.databaseUrl,
        apiBaseUrl: config.apiBaseUrl,
        commitAutoApprove: config.commitAutoApprove,
      });
    } catch (err) {
      logger.error(`Error: ${err}`);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List open GitHub issues")
  .action(async () => {
    try {
      const config = loadConfig();
      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName, config.githubMaxRetries);

      const issues = await github.listOpenIssues();

      logger.banner([
        `📋 Open Issues — ${config.repoOwner}/${config.repoName}`,
      ]);

      if (issues.length === 0) {
        logger.info("No open issues found.");
        return;
      }

      for (const issue of issues) {
        const labels = issue.labels.map((l) => l.name).join(", ");
        console.log(`  #${issue.number}  ${issue.title}  ${labels ? `[${labels}]` : ""}`);
      }
      console.log();
    } catch (err) {
      logger.error(`Error: ${err}`);
      process.exit(1);
    }
  });

program
  .command("ui")
  .description("Start the web UI server (chat + jobs dashboard)")
  .option("-p, --port <port>", "Server port (default: WEB_PORT env or 3002)")
  .action(async (opts: { port?: string }) => {
    try {
      await startWebServer({ port: opts.port ? parseInt(opts.port, 10) : undefined });
    } catch (err) {
      logger.error(`Error: ${err}`);
      process.exit(1);
    }
  });

const retryCmd = program
  .command("retry")
  .description("Inspect or reprocess failed runs");

retryCmd
  .command("list")
  .description("List pending retries from state files")
  .action(async () => {
    const stateManager = new StateManager("state");
    const commitState = new CommitStateManager("state");
    const issues = stateManager.getDueIssueRetries();
    const commits = commitState.getDueCommitRetries();

    logger.banner(["🔁 Pending Retries"]);

    if (issues.length === 0 && commits.length === 0) {
      logger.info("No pending retries.");
      return;
    }

    for (const r of issues) {
      console.log(`  issue  #${r.number}  "${r.title}"  attempts=${r.attempts}  error: ${r.lastError}`);
    }
    for (const r of commits) {
      console.log(`  commit ${r.sha.slice(0, 7)}  "${r.message}"  attempts=${r.attempts}  error: ${r.lastError}`);
    }
    console.log();
  });

retryCmd
  .command("issue")
  .description("Reprocess a failed issue immediately")
  .argument("<number>", "Issue number to reprocess")
  .action(async (numberStr: string) => {
    try {
      const config = loadConfig();
      if (!config.agentEnabled) {
        logger.info("Agent is disabled (AGENT_ENABLED=false). Exiting.");
        return;
      }
      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName, config.githubMaxRetries);
      const stateManager = new StateManager("state");

      const issueNumber = parseInt(numberStr, 10);
      if (isNaN(issueNumber)) throw new Error(`Invalid issue number: ${numberStr}`);

      const issue = await github.getIssue(issueNumber);

      logger.banner([
        "🤖 MCalendar Multi-AI Test Agent",
        `Retrying issue #${issue.number}: ${issue.title}`,
      ]);

      const result = await processIssue(issue, {
        agentConfig: config.agentConfig,
        githubClient: github,
        codebasePath: config.codebasePath,
        testProjectPath: config.testProjectPath,
        maxRetries: config.maxRetries,
        maxIterations: config.maxIterations,
        maxPipelineSteps: config.maxPipelineSteps,
        projectName: config.projectName,
        databaseUrl: config.databaseUrl,
        apiBaseUrl: config.apiBaseUrl,
        commitAutoApprove: config.commitAutoApprove,
      });

      if (result.success) {
        stateManager.resolveIssueRetry(issueNumber);
        logger.success(`\n✅ Done — ${result.output}`);
      } else {
        logger.warn(`\n❌ Still failing — left in retry queue (if queued): ${result.output}`);
      }
    } catch (err) {
      logger.error(`Error: ${err}`);
      process.exit(1);
    }
  });

retryCmd
  .command("commit")
  .description("Reprocess a failed commit immediately")
  .argument("<sha>", "Commit SHA to reprocess")
  .option("-b, --branch <branch>", "Target branch to merge into")
  .action(async (sha: string, opts: { branch?: string }) => {
    try {
      const config = loadConfig();
      if (!config.agentEnabled) {
        logger.info("Agent is disabled (AGENT_ENABLED=false). Exiting.");
        return;
      }
      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName, config.githubMaxRetries);
      const commitState = new CommitStateManager("state");

      const targetBranch = opts.branch ?? config.watchBranch ?? await github.getDefaultBranch();

      logger.banner([
        "🤖 MCalendar Multi-AI Test Agent",
        `Retrying commit ${sha.slice(0, 7)}`,
      ]);

      const diff = await github.getCommitDiff(sha);

      const result = await processCommit(diff, {
        agentConfig: config.agentConfig,
        githubClient: github,
        codebasePath: config.codebasePath,
        testProjectPath: config.testProjectPath,
        maxRetries: config.maxRetries,
        maxIterations: config.maxIterations,
        maxPipelineSteps: config.maxPipelineSteps,
        targetBranch,
        projectName: config.projectName,
        databaseUrl: config.databaseUrl,
        apiBaseUrl: config.apiBaseUrl,
        commitAutoApprove: config.commitAutoApprove,
      });

      if (result.success) {
        commitState.resolveCommitRetry(sha);
        logger.success(`\n✅ Done — ${result.output}`);
      } else {
        logger.warn(`\n❌ Still failing — left in retry queue (if queued): ${result.output}`);
      }
    } catch (err) {
      logger.error(`Error: ${err}`);
      process.exit(1);
    }
  });

retryCmd
  .command("clear")
  .description("Clear all pending retries")
  .action(() => {
    const stateManager = new StateManager("state");
    const commitState = new CommitStateManager("state");
    const issuesCleared = stateManager.clearIssueRetries();
    const commitsCleared = commitState.clearCommitRetries();
    logger.success(`Cleared ${issuesCleared} issue retry(ies) and ${commitsCleared} commit retry(ies).`);
  });

program.parse();
