import type { AgentConfig } from "../providers/types.js";
import { GitHubClient } from "../github/client.js";
import { processIssue, type OrchestratorConfig } from "../orchestrator/issue_orchestrator.js";
import { processCommit, type CommitOrchestratorConfig } from "../orchestrator/commit_orchestrator.js";
import { checkForNewCommits } from "./commit_analyzer_watcher.js";
import { CommitStateManager } from "./Commit_State_Tracker.js";
import { StateManager } from "./Issue_State_Tracker.js";
import { logger } from "../utils/logger.js";

export interface WatcherConfig {
  agentConfig: AgentConfig;
  githubClient: GitHubClient;
  mcalendarPath: string;
  testProjectPath: string;
  maxRetries: number;
  pollIntervalMin: number;
  stateDir: string;
  watchBranch?: string;
}

export async function startWatcher(config: WatcherConfig): Promise<void> {
  const { agentConfig, githubClient, mcalendarPath, testProjectPath, maxRetries, pollIntervalMin, stateDir, watchBranch } = config;
  const stateManager = new StateManager(stateDir);
  const commitState = new CommitStateManager(stateDir);

  const modes: string[] = [];
  modes.push("issues");
  if (watchBranch) modes.push(`commits on "${watchBranch}"`);

  logger.banner([
    "🤖 MCalendar Multi-AI Test Agent — Watch Mode",
    `Polling every ${pollIntervalMin}m for: ${modes.join(" + ")}`,
    `Last processed issue: #${stateManager.getLastProcessedNumber()}`,
  ]);

  const orchestratorConfig: OrchestratorConfig = {
    agentConfig,
    githubClient,
    mcalendarPath,
    testProjectPath,
    maxRetries,
  };

  let targetBranch = watchBranch ?? "";

  const poll = async () => {
    try {
      const lastNumber = stateManager.getLastProcessedNumber();
      const newIssues = await githubClient.getNewIssues(lastNumber);

      for (const issue of newIssues) {
        logger.success(`✨ New issue detected: #${issue.number} "${issue.title}"`);

        try {
          const result = await processIssue(issue, orchestratorConfig);
          stateManager.updateAfterProcessing(issue.number, issue.title, {
            status: result.success ? "completed" : "failed",
            testsPassed: result.testsPassed,
            testsFailed: result.testsFailed,
            retries: result.retries,
          });
        } catch (err) {
          logger.error(`Failed to process issue #${issue.number}: ${err}`);
          stateManager.updateAfterProcessing(issue.number, issue.title, {
            status: "failed",
          });
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

          try {
            const commitConfig: CommitOrchestratorConfig = {
              agentConfig,
              githubClient,
              mcalendarPath,
              testProjectPath,
              maxRetries,
              targetBranch,
            };
            await processCommit(diff, commitConfig);
          } catch (err) {
            logger.error(`Failed to process commit ${diff.sha.slice(0, 7)}: ${err}`);
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
