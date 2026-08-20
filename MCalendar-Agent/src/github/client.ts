import { Octokit } from "@octokit/rest";
import type { GitHubIssue, GitHubPR, GitHubReview, GitHubCommit, CommitFile, CommitDiff } from "./types.js";
import { logger } from "../utils/logger.js";

const RETRYABLE_CODES = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"];
const RETRYABLE_STATUS_CODES = [502, 503, 504, 429];

function isRetryable(err: unknown): boolean {
  const e = err as { code?: string; status?: number; message?: string };
  if (e.code && RETRYABLE_CODES.includes(e.code)) return true;
  if (e.status && RETRYABLE_STATUS_CODES.includes(e.status)) return true;
  if (e.message?.includes("other side closed")) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════
// REST API (ACTIVE — default)
// ═══════════════════════════════════════════════════════════
export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private maxRetries: number;

  constructor(token: string, owner: string, repo: string, maxRetries = 3) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.maxRetries = maxRetries;
  }

  private async withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt < this.maxRetries && isRetryable(err)) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          logger.warn(`⚠️ ${label} failed (attempt ${attempt}/${this.maxRetries}): ${(err as Error).message}`);
          logger.info(`   Retrying in ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`${label} failed after ${this.maxRetries} retries`);
  }

  async getIssue(number: number): Promise<GitHubIssue> {
    return this.withRetry(`getIssue(#${number})`, async () => {
      const { data } = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
      });
      return data as unknown as GitHubIssue;
    });
  }

  async listOpenIssues(): Promise<GitHubIssue[]> {
    return this.withRetry("listOpenIssues", async () => {
      const { data } = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: "open",
        sort: "created",
        direction: "desc",
        per_page: 30,
      });
      return (data as unknown as GitHubIssue[]).filter((i) => !i.pull_request);
    });
  }

  async getNewIssues(lastProcessedNumber: number): Promise<GitHubIssue[]> {
    const issues = await this.listOpenIssues();
    return issues.filter((i) => i.number > lastProcessedNumber);
  }

  async addComment(issueNumber: number, body: string): Promise<void> {
    return this.withRetry(`addComment(#${issueNumber})`, async () => {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body,
      });
    });
  }

  async addPRComment(prUrl: string, body: string): Promise<void> {
    const prNumber = parseInt(prUrl.split("/").pop() ?? "0", 10);
    if (!prNumber) return;
    return this.withRetry(`addPRComment(#${prNumber})`, async () => {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        body,
      });
    });
  }

  async createPR(params: {
    title: string;
    body: string;
    head: string;
    base: string;
    draft?: boolean;
  }): Promise<GitHubPR> {
    return this.withRetry(`createPR(${params.head}→${params.base})`, async () => {
      const { data } = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        ...params,
        draft: params.draft ?? false,
      });
      return data as unknown as GitHubPR;
    });
  }

  async getDefaultBranch(): Promise<string> {
    return this.withRetry("getDefaultBranch", async () => {
      const { data } = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo,
      });
      return data.default_branch;
    });
  }

  async listCommits(branch: string, since?: string): Promise<GitHubCommit[]> {
    return this.withRetry(`listCommits(${branch})`, async () => {
      const { data } = await this.octokit.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        sha: branch,
        per_page: 10,
        ...(since ? { since } : {}),
      });
      return data as unknown as GitHubCommit[];
    });
  }

  async getCommitDiff(sha: string): Promise<CommitDiff> {
    return this.withRetry(`getCommitDiff(${sha.slice(0, 7)})`, async () => {
      const { data } = await this.octokit.repos.getCommit({
        owner: this.owner,
        repo: this.repo,
        ref: sha,
      });

      const files: CommitFile[] = (data.files ?? []).map(
        (f: Record<string, unknown>) => ({
          filename: f.filename as string,
          status: f.status as string,
          additions: f.additions as number,
          deletions: f.deletions as number,
          patch: f.patch as string | undefined,
        })
      );

      return {
        sha: data.sha,
        message: data.commit.message,
        author: data.commit.author?.name ?? "unknown",
        date: data.commit.author?.date ?? new Date().toISOString(),
        files,
        totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
        totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      };
    });
  }

  async createReview(params: {
    pull_number: number;
    event: "APPROVE" | "COMMENT" | "REQUEST_CHANGES";
    body?: string;
  }): Promise<GitHubReview> {
    return this.withRetry(`createReview(PR #${params.pull_number})`, async () => {
      const { data } = await this.octokit.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        ...params,
      });
      return data as unknown as GitHubReview;
    });
  }

  async mergePR(params: {
    pull_number: number;
    merge_method?: "merge" | "squash" | "rebase";
  }): Promise<void> {
    return this.withRetry(`mergePR(PR #${params.pull_number})`, async () => {
      await this.octokit.pulls.merge({
        owner: this.owner,
        repo: this.repo,
        ...params,
        merge_method: params.merge_method ?? "squash",
      });
    });
  }
}

// ═══════════════════════════════════════════════════════════
// GRAPHQL API — UNCOMMENT FOR EFFICIENCY
// Fetches issue + labels + comments in ONE request instead of 3-4
// ═══════════════════════════════════════════════════════════
//
// export class GitHubClientGraphQL {
//   private endpoint = "https://api.github.com/graphql";
//   private token: string;
//   private owner: string;
//   private repo: string;
//
//   constructor(token: string, owner: string, repo: string) {
//     this.token = token;
//     this.owner = owner;
//     this.repo = repo;
//   }
//
//   private async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
//     const res = await fetch(this.endpoint, {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${this.token}`,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({ query, variables }),
//     });
//     if (!res.ok) throw new Error(`GitHub GraphQL error: ${res.status}`);
//     const json = (await res.json()) as { data: T; errors?: unknown[] };
//     if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
//     return json.data;
//   }
//
//   async getIssue(number: number) {
//     const data = await this.query<{
//       repository: {
//         issue: {
//           title: string;
//           body: string;
//           state: string;
//           createdAt: string;
//           labels: { nodes: { name: string }[] };
//           comments: { nodes: { body: string }[] };
//         };
//       };
//     }>(
//       `query($owner: String!, $repo: String!, $number: Int!) {
//         repository(owner: $owner, name: $repo) {
//           issue(number: $number) {
//             title body state createdAt
//             labels(first: 10) { nodes { name } }
//             comments(first: 50) { nodes { body } }
//           }
//         }
//       }`,
//       { owner: this.owner, repo: this.repo, number }
//     );
//     return data.repository.issue;
//   }
// }
