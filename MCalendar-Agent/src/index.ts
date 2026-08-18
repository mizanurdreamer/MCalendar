import { Command } from "commander";
import { loadConfig } from "./config/index.js";
import { GitHubClient } from "./github/client.js";
import { processIssue } from "./agent/Agent_Issue_Analyzer.js";
import { processCommit } from "./agent/Agent_Commit_Analyzer.js";
import { startWatcher } from "./watcher/Agent_Issue_Analyzer_Watcher.js";
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
      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName);

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
        mcalendarPath: config.mcalendarPath,
        testProjectPath: config.testProjectPath,
        maxRetries: config.maxRetries,
      });

      logger.success(`\n✅ Done — ${result.output}`);
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

      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName);

      await startWatcher({
        agentConfig: config.agentConfig,
        githubClient: github,
        mcalendarPath: config.mcalendarPath,
        testProjectPath: config.testProjectPath,
        maxRetries: config.maxRetries,
        pollIntervalMin: pollInterval,
        stateDir: "state",
        watchBranch,
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

      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName);

      const watchBranch = branchArg ?? config.watchBranch;
      if (!watchBranch) {
        throw new Error("No branch specified. Pass a branch name or set WATCH_BRANCH in .env");
      }

      await startWatcher({
        agentConfig: config.agentConfig,
        githubClient: github,
        mcalendarPath: config.mcalendarPath,
        testProjectPath: config.testProjectPath,
        maxRetries: config.maxRetries,
        pollIntervalMin: pollInterval,
        stateDir: "state",
        watchBranch,
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
      const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName);

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

program.parse();
