import { simpleGit, SimpleGit } from "simple-git";
import type { GitHubClient } from "./client.js";
import type { GitHubPR } from "./types.js";
import { logger } from "../utils/logger.js";

export class GitBranch {
  private git: SimpleGit;
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.git = simpleGit(basePath);
  }

  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current ?? "main";
  }

  async createAndCheckout(branchName: string, baseBranch: string): Promise<void> {
    try {
      logger.task("Git", `fetching origin/${baseBranch}`);
      await this.git.fetch("origin", baseBranch);

      const branches = await this.git.branch();
      if (branches.all.includes(branchName)) {
        logger.info(`Git: Branch "${branchName}" exists, checking out`);
        await this.git.checkout(branchName);
      } else {
        logger.info(`Git: Creating and checking out branch "${branchName}" from "${baseBranch}"`);
        await this.git.checkoutLocalBranch(branchName);
      }
      logger.success(`Git: On branch "${branchName}"`);
    } catch (err) {
      logger.error(`Git: Failed to create/checkout branch "${branchName}": ${err}`);
      throw err;
    }
  }

  async commit(message: string, testOutputPath?: string): Promise<void> {
    try {
      const stagingPath = testOutputPath ?? "E2ETests/";
      logger.info(`Git: Staging ${stagingPath}`);
      await this.git.add(stagingPath);
      logger.info(`Git: Committing — "${message}"`);
      await this.git.commit(message);
      logger.success("Git: Committed");
    } catch (err) {
      logger.error(`Git: Commit failed: ${err}`);
      throw err;
    }
  }

  async push(branchName: string): Promise<void> {
    try {
      logger.info(`Git: Pushing "${branchName}" to origin`);
      await this.git.push("origin", branchName, ["--set-upstream"]);
      logger.success("Git: Pushed");
    } catch (err) {
      logger.error(`Git: Push failed: ${err}`);
      throw err;
    }
  }

  async commitAndPush(commitMessage: string, branchName: string, testOutputPath?: string): Promise<void> {
    logger.task("Git", `committing + pushing ${branchName}`);
    await this.commit(commitMessage, testOutputPath);
    await this.push(branchName);
  }

  async createPR(
    githubClient: GitHubClient,
    params: { title: string; body: string; head: string; base: string }
  ): Promise<GitHubPR> {
    try {
      logger.task("Git", `creating PR ${params.head} → ${params.base}`);
      const pr = await githubClient.createPR(params);
      logger.success(`PR #${pr.number} created → ${params.base}`);
      return pr;
    } catch (err) {
      logger.error(`Git: PR creation failed: ${err}`);
      throw err;
    }
  }

  static slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  }

  static branchName(issueNumber: number, title: string): string {
    const slug = GitBranch.slugify(title);
    return `test/issue-${issueNumber}-${slug}`;
  }
}
