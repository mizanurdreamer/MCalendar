import type { AgentConfig } from "../providers/types.js";
import { GitHubClient } from "../github/client.js";
import type { GitHubIssue, CommitDiff } from "../github/types.js";
import { processIssue, type OrchestratorConfig } from "../orchestrator/issue_orchestrator.js";
import { processCommit, type CommitOrchestratorConfig } from "../orchestrator/commit_orchestrator.js";
import { checkForNewCommits } from "./commit_orchestrator_watcher.js";
import { CommitStateManager } from "./commit_state_tracker.js";
import { StateManager } from "./issue_state_tracker.js";
import { logger } from "../utils/logger.js";
import { PIPELINE_STATUS } from "../utils/constants.js";

interface RunOutcome {
  ok: boolean;
  error?: string;
}

export interface WatcherConfig {
  agentConfig: AgentConfig;
  githubClient: GitHubClient;
  codebasePath: string;
  testProjectPath: string;
  maxRetries: number;
  maxIterations: number;
  maxPipelineSteps: number;
  runMaxRetries: number;
  pollIntervalMin: number;
  stateDir: string;
  watchBranch?: string;
  projectName: string;
  databaseUrl?: string;
  apiBaseUrl?: string;
  commitAutoApprove?: boolean;
  playwrightMcpEnabled?: boolean;
  playwrightMcpBrowser?: string;
  memoryType?: "local" | "postgres";
}

export async function startWatcher(config: WatcherConfig): Promise<void> {
  const { agentConfig, githubClient, codebasePath, testProjectPath, maxRetries, maxIterations, maxPipelineSteps, runMaxRetries, pollIntervalMin, stateDir, watchBranch, projectName } = config;
  const stateManager = new StateManager(stateDir);
  const commitState = new CommitStateManager(stateDir);

  const modes: string[] = [];
  modes.push("issues");
  if (watchBranch) modes.push(`commits on "${watchBranch}"`);

  logger.banner([
    "🤖 MCalendar Multi-AI Test Agent — Watch Mode",
    `Polling every ${pollIntervalMin}m for: ${modes.join(" + ")}`,
    `Orchestration: Agentic (LangGraph)`,
    `Last processed issue: #${stateManager.getLastProcessedNumber()}`,
    `Pending retries: ${stateManager.getDueIssueRetries().length + commitState.getDueCommitRetries().length}`,
  ]);

  const orchestratorConfig: OrchestratorConfig = {
    agentConfig,
    githubClient,
    codebasePath,
    testProjectPath,
    maxRetries,
    maxIterations,
    maxPipelineSteps,
    projectName,
    baseBranch: watchBranch,
    databaseUrl: config.databaseUrl,
    apiBaseUrl: config.apiBaseUrl,
    commitAutoApprove: config.commitAutoApprove,
    playwrightMcpEnabled: config.playwrightMcpEnabled,
    playwrightMcpBrowser: config.playwrightMcpBrowser,
    memoryType: config.memoryType,
  };

  let targetBranch = watchBranch ?? "";

  const processIssueSafe = async (issue: GitHubIssue): Promise<RunOutcome> => {
    try {
      const result = await processIssue(issue, orchestratorConfig);
      stateManager.updateAfterProcessing(issue.number, issue.title, {
        status: result.success ? PIPELINE_STATUS.COMPLETED : PIPELINE_STATUS.FAILED,
        testsPassed: result.testsPassed,
        testsFailed: result.testsFailed,
        retries: result.retries,
        retryHistory: result.retryHistory,
      });
      if (!result.success) {
        return { ok: false, error: "pipeline completed with failing tests" };
      }
      return { ok: true };
    } catch (err) {
      logger.error(`Failed to process issue #${issue.number}: ${err}`);
      stateManager.updateAfterProcessing(issue.number, issue.title, { status: PIPELINE_STATUS.FAILED });
      return { ok: false, error: String(err) };
    }
  };

  const processCommitSafe = async (diff: CommitDiff): Promise<RunOutcome> => {
    try {
      const commitConfig: CommitOrchestratorConfig = {
        agentConfig,
        githubClient,
        codebasePath,
        testProjectPath,
        maxRetries,
        maxIterations,
        maxPipelineSteps,
        targetBranch,
        projectName,
        databaseUrl: config.databaseUrl,
        apiBaseUrl: config.apiBaseUrl,
        commitAutoApprove: config.commitAutoApprove,
        memoryType: config.memoryType,
      };
      const result = await processCommit(diff, commitConfig);
      commitState.updateAfterProcessing(diff.sha, {
        status: result.success ? PIPELINE_STATUS.COMPLETED : PIPELINE_STATUS.FAILED,
        retryHistory: result.retryHistory,
      });
      if (!result.success) {
        return { ok: false, error: "pipeline completed with failing tests" };
      }
      return { ok: true };
    } catch (err) {
      logger.error(`Failed to process commit ${diff.sha.slice(0, 7)}: ${err}`);
      commitState.updateAfterProcessing(diff.sha, { status: PIPELINE_STATUS.FAILED });
      return { ok: false, error: String(err) };
    }
  };

  const retryQueuedIssues = async (): Promise<void> => {
    const due = stateManager.getDueIssueRetries();
    if (due.length === 0) return;
    logger.info(`🔁 Retrying ${due.length} failed issue(s)...`);

    for (const entry of due) {
      let issue: GitHubIssue;
      try {
        issue = await githubClient.getIssue(entry.number);
      } catch (err) {
        logger.warn(`⚠️ Issue #${entry.number} unreachable (${(err as Error).message}) — abandoning retry`);
        stateManager.resolveIssueRetry(entry.number);
        continue;
      }

      if (issue.state !== "open") {
        logger.info(`⏭️ Issue #${entry.number} is now "${issue.state}" — dropping retry`);
        stateManager.resolveIssueRetry(entry.number);
        continue;
      }

      logger.info(`🔁 Retrying issue #${entry.number} (attempt ${entry.attempts + 1})`);
      const outcome = await processIssueSafe(issue);

      if (outcome.ok) {
        stateManager.resolveIssueRetry(entry.number);
        logger.success(`✅ Retry succeeded for issue #${entry.number}`);
      } else {
        const kept = stateManager.markIssueRetryFailed(entry.number, outcome.error ?? "unknown", runMaxRetries);
        if (!kept) {
          logger.warn(`🛑 Issue #${entry.number} failed again — retry budget exhausted, abandoning`);
        }
      }
    }
  };

  const retryQueuedCommits = async (): Promise<void> => {
    const due = commitState.getDueCommitRetries();
    if (due.length === 0) return;
    logger.info(`🔁 Retrying ${due.length} failed commit(s)...`);

    for (const entry of due) {
      let diff: CommitDiff;
      try {
        diff = await githubClient.getCommitDiff(entry.sha);
      } catch (err) {
        logger.warn(`⚠️ Commit ${entry.sha.slice(0, 7)} unreachable (${(err as Error).message}) — abandoning retry`);
        commitState.resolveCommitRetry(entry.sha);
        continue;
      }

      logger.info(`🔁 Retrying commit ${entry.sha.slice(0, 7)} (attempt ${entry.attempts + 1})`);
      const outcome = await processCommitSafe(diff);

      if (outcome.ok) {
        commitState.resolveCommitRetry(entry.sha);
        logger.success(`✅ Retry succeeded for commit ${entry.sha.slice(0, 7)}`);
      } else {
        const kept = commitState.markCommitRetryFailed(entry.sha, outcome.error ?? "unknown", runMaxRetries);
        if (!kept) {
          logger.warn(`🛑 Commit ${entry.sha.slice(0, 7)} failed again — retry budget exhausted, abandoning`);
        }
      }
    }
  };

  const runRetrySweep = async (): Promise<void> => {
    if (runMaxRetries <= 0) return;
    await retryQueuedIssues();
    await retryQueuedCommits();
  };

  const poll = async () => {
    try {
      await runRetrySweep();

      const lastNumber = stateManager.getLastProcessedNumber();
      const newIssues = await githubClient.getNewIssues(lastNumber);

      for (const issue of newIssues) {
        logger.success(`✨ New issue detected: #${issue.number} "${issue.title}"`);

        const outcome = await processIssueSafe(issue);
        if (!outcome.ok && runMaxRetries > 0) {
          stateManager.enqueueIssueRetry(issue.number, issue.title, outcome.error ?? "unknown");
          logger.warn(`🔁 Queued issue #${issue.number} for retry on next poll`);
        }
      }

      if (watchBranch) {
        if (!targetBranch) {
          targetBranch = await githubClient.getDefaultBranch();
          logger.info(`Resolved target branch: ${targetBranch}`);
        }

        const newCommits = await checkForNewCommits(githubClient, watchBranch, commitState);

        for (const diff of newCommits) {
          logger.success(`✨ New commit: ${diff.sha.slice(0, 7)} "${diff.message.split("\n")[0]}"`);

          const outcome = await processCommitSafe(diff);
          if (!outcome.ok && runMaxRetries > 0) {
            commitState.enqueueCommitRetry(diff.sha, diff.message, outcome.error ?? "unknown");
            logger.warn(`🔁 Queued commit ${diff.sha.slice(0, 7)} for retry on next poll`);
          }
        }

        if (newIssues.length === 0 && newCommits.length === 0) {
          logger.info("No new issues or commits found.");
        }
      } else {
        if (newIssues.length === 0) {
          logger.info("No new issues found.");
        }
      }
    } catch (err) {
      logger.error(`Polling error: ${err}`);
    }
  };

  await poll();
  setInterval(poll, pollIntervalMin * 60_000);
}