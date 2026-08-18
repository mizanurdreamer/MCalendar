import type { GitHubClient } from "../github/client.js";
import type { CommitDiff } from "../github/types.js";
import { CommitStateManager } from "./Commit_State_Tracker.js";
import { logger } from "../utils/logger.js";

export async function checkForNewCommits(
  github: GitHubClient,
  branch: string,
  state: CommitStateManager
): Promise<CommitDiff[]> {
  const lastSeenSha = state.getLastSeenSha(branch);

  const commits = await github.listCommits(branch);

  if (commits.length === 0) return [];

  if (!lastSeenSha) {
    state.updateBranch(branch, commits[0].sha);
    logger.info(`📌 First run on branch "${branch}" — baseline SHA: ${commits[0].sha.slice(0, 7)}`);
    return [];
  }

  const newCommits = [];
  for (const commit of commits) {
    if (commit.sha === lastSeenSha) break;
    newCommits.push(commit);
  }

  if (newCommits.length === 0) return [];

  newCommits.reverse();

  const diffs: CommitDiff[] = [];
  for (const commit of newCommits) {
    try {
      const diff = await github.getCommitDiff(commit.sha);
      diffs.push(diff);
    } catch (err) {
      logger.error(`Failed to get diff for ${commit.sha.slice(0, 7)}: ${err}`);
    }
  }

  state.updateBranch(branch, commits[0].sha);

  return diffs;
}
