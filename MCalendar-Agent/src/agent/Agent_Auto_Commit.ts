import type { GitHubClient } from "../github/client.js";
import type { GitBranch } from "../github/git_operations.js";
import { logger } from "../utils/logger.js";

export interface AutoCommitResult {
  prNumber: number;
  prUrl: string;
}

export async function autoCommit(
  git: GitBranch,
  githubClient: GitHubClient,
  branchName: string,
  baseBranch: string,
  commitMessage: string,
  prTitle: string,
  prBody: string
): Promise<AutoCommitResult> {
  logger.task("Auto_Commit", `committing + pushing ${branchName}`);

  await git.commit(commitMessage);
  logger.success("Committed");

  await git.push(branchName);
  logger.success("Pushed");

  // logger.info("Creating PR...");
  // const pr = await githubClient.createPR({
  //   title: prTitle,
  //   body: prBody,
  //   head: branchName,
  //   base: baseBranch,
  // });

  // logger.success(`PR #${pr.number} created → ${baseBranch}`);

  return {
    prNumber: 0,
    prUrl: "",
  };
}
