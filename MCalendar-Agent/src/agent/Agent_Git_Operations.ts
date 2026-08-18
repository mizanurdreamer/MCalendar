import simpleGit from "simple-git";
import path from "node:path";

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
