import simpleGit from "simple-git";
import type { GitHubClient } from "./client.js";
import type { GitHubPR } from "./types.js";
import { logger } from "../utils/logger.js";

export class GitBranch {
  private git: ReturnType<typeof simpleGit>;
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
    await this.git.fetch("origin", baseBranch);
    const branches = await this.git.branchLocal();
    if (branches.all.includes(branchName)) {
      await this.git.checkout(branchName);
    } else {
      await this.git.checkoutLocalBranch(branchName);
    }
  }

  async commit(message: string): Promise<void> {
    await this.git.add(".");
    await this.git.commit(message);
  }

  async push(branchName: string): Promise<void> {
    await this.git.push("origin", branchName, ["--set-upstream"]);
  }

  async commitAndPush(commitMessage: string, branchName: string): Promise<void> {
    logger.task("Git", `committing + pushing ${branchName}`);
    await this.commit(commitMessage);
    logger.success("Committed");
    await this.push(branchName);
    logger.success("Pushed");
  }

  async createPR(
    githubClient: GitHubClient,
    params: { title: string; body: string; head: string; base: string }
  ): Promise<GitHubPR> {
    logger.task("Git", `creating PR ${params.head} → ${params.base}`);
    const pr = await githubClient.createPR(params);
    logger.success(`PR #${pr.number} created → ${params.base}`);
    return pr;
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
