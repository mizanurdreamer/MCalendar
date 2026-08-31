import { Octokit } from "@octokit/rest";
import type { GitHubIssue, GitHubPR, GitHubReview, GitHubCommit, CommitFile, CommitDiff } from "./types.js";
import { logger } from "../utils/logger.js";

const RETRYABLE_CODES = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"];
const RETRYABLE_STATUS_CODES = [502, 503, 504, 429];

type OctokitWithGraphql = Octokit & {
  graphql<T = any>(query: string, variables?: Record<string, any>): Promise<T>;
};

const PERMISSION_HINT =
  "Your GitHub token lacks permission for this action. " +
  "Fine-grained token: GitHub Settings → Developer settings → Personal access tokens → " +
  "grant 'Pull requests: Read and write' and 'Issues: Read and write' for this repo. " +
  "Classic token: regenerate with the full 'repo' scope. " +
  "Then update GITHUB_TOKEN in .env and restart.";

function isRetryable(err: unknown): boolean {
  const e = err as { code?: string; status?: number; message?: string };
  // Check status first — accessing .code on Octokit RequestError triggers a deprecation warning
  if (e.status && RETRYABLE_STATUS_CODES.includes(e.status)) return true;
  if (!e.status && e.code && RETRYABLE_CODES.includes(e.code)) return true;
  if (e.message?.includes("other side closed")) return true;
  return false;
}

function withPermissionHint(err: unknown, action: string): never {
  const e = err as { status?: number; message?: string };
  if (e.status === 403 || String(e.message).includes("Resource not accessible")) {
    throw new Error(`${action} failed — token permission missing (403). ${PERMISSION_HINT}`);
  }
  throw err instanceof Error ? err : new Error(String(err));
}

// ═══════════════════════════════════════════════════════════
// REST API (ACTIVE — default)
// ═══════════════════════════════════════════════════════════
export class GitHubClient {
  private octokit: OctokitWithGraphql;
  private owner: string;
  private repo: string;
  private maxRetries: number;

  constructor(token: string, owner: string, repo: string, maxRetries = 3) {
    this.octokit = new Octokit({ auth: token }) as OctokitWithGraphql;
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
      const { data } = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
      });
      return data as unknown as GitHubIssue;
    });
  }

  async listOpenIssues(): Promise<GitHubIssue[]> {
    return this.withRetry("listOpenIssues", async () => {
      const { data } = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: "open",
        per_page: 30,
      });
      return (data as unknown as GitHubIssue[]).filter((i) => !i.pull_request);
    });
  }

  async getNewIssues(lastProcessedNumber: number): Promise<GitHubIssue[]> {
    const issues = await this.listOpenIssues();
    return issues.filter((i) => i.number > lastProcessedNumber);
  }

  async listIssuesByProjectStatus(status: string): Promise<GitHubIssue[]> {
    const projectNumber = parseInt(process.env.GITHUB_PROJECT_NUMBER ?? "0", 10);
    if (!projectNumber) {
      logger.warn(`[GitHub] GITHUB_PROJECT_NUMBER not set, falling back to listOpenIssues()`);
      return this.listOpenIssues();
    }

    try {
      const data = await this.octokit.graphql<{
        user: {
          projectV2: {
            items: {
              nodes: Array<{
                id: string;
                content: { number: number; title: string } | null;
                fieldValues: {
                  nodes: Array<{
                    name: string;
                    field: { name: string };
                  }>;
                };
              }>;
            };
          };
        };
      }>(
        `query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              items(first: 100) {
                nodes {
                  id
                  content {
                    ... on Issue {
                      number
                      title
                    }
                  }
                  fieldValues(first: 10) {
                    nodes {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                        field { name }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        { login: this.owner, number: projectNumber }
      );

      const items = data.user.projectV2.items.nodes;
      const issueNumbers: number[] = [];

      for (const item of items) {
        if (!item.content?.number) continue;

        const statusValue = item.fieldValues.nodes.find(
          (fv) => fv.field.name === "Status"
        );

        if (statusValue?.name === status) {
          issueNumbers.push(item.content.number);
        }
      }

      if (issueNumbers.length === 0) return [];

      const issues = await this.listOpenIssues();
      return issues.filter((i) => issueNumbers.includes(i.number));
    } catch (err) {
      logger.warn(`[GitHub] Failed to list issues by project status: ${err}`);
      return this.listOpenIssues();
    }
  }

  async addComment(issueNumber: number, body: string): Promise<void> {
    try {
      return await this.withRetry(`addComment(#${issueNumber})`, async () => {
        await this.octokit.rest.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          body,
        });
      });
    } catch (err) {
      withPermissionHint(err, `Commenting on issue #${issueNumber}`);
    }
  }

  async getIssueNodeId(issueNumber: number): Promise<string | null> {
    try {
      const data = await this.octokit.graphql<{ repository: { issue: { id: string } } }>(
        `query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $number) { id }
          }
        }`,
        { owner: this.owner, repo: this.repo, number: issueNumber }
      );
      return data.repository.issue.id;
    } catch (err) {
      logger.warn(`[GitHub] Failed to get issue node ID for #${issueNumber}: ${err}`);
      return null;
    }
  }

  async updateProjectStatus(issueNodeId: string, status: string): Promise<void> {
    const projectNumber = parseInt(process.env.GITHUB_PROJECT_NUMBER ?? "0", 10);
    if (!projectNumber) {
      logger.warn(`[GitHub] GITHUB_PROJECT_NUMBER not set, skipping project status update`);
      return;
    }

    try {
      // 1. Get project ID
      const projectData = await this.octokit.graphql<{
        user: { projectV2: { id: string } };
      }>(
        `query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) { id }
          }
        }`,
        { login: this.owner, number: projectNumber }
      );
      const projectId = projectData.user.projectV2.id;

      // 2. Get Status field ID and option IDs
      const fieldData = await this.octokit.graphql<{
        user: { projectV2: { field: { id: string; options: Array<{ id: string; name: string }> } } };
      }>(
        `query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              field(name: "Status") {
                ... on ProjectV2SingleSelectField {
                  id
                  options { id name }
                }
              }
            }
          }
        }`,
        { login: this.owner, number: projectNumber }
      );

      const field = projectData && fieldData.user.projectV2.field as { id: string; options: Array<{ id: string; name: string }> };
      if (!field?.id) {
        logger.warn(`[GitHub] Status field not found in project #${projectNumber}`);
        return;
      }

      const option = field.options.find((o: { id: string; name: string }) => o.name === status);
      if (!option) {
        logger.warn(`[GitHub] Status option "${status}" not found in project. Available: ${field.options.map((o: { id: string; name: string }) => o.name).join(", ")}`);
        return;
      }

      // 3. Update the status
      await this.octokit.graphql(
        `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: ID!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }) {
            projectV2Item { id }
          }
        }`,
        { projectId, itemId: issueNodeId, fieldId: field.id, optionId: option.id }
      );

      logger.success(`[GitHub] Issue status updated to "${status}" in project #${projectNumber}`);
    } catch (err) {
      logger.warn(`[GitHub] Failed to update project status: ${err}`);
    }
  }

  async addPRComment(prUrl: string, body: string): Promise<void> {
    const prNumber = parseInt(prUrl.split("/").pop() ?? "0", 10);
    if (!prNumber) return;
    try {
      return await this.withRetry(`addPRComment(#${prNumber})`, async () => {
        await this.octokit.rest.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: prNumber,
          body,
        });
      });
    } catch (err) {
      withPermissionHint(err, `Commenting on PR #${prNumber}`);
    }
  }

  async createPR(params: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<GitHubPR> {
    try {
      return await this.withRetry(`createPR(${params.head}→${params.base})`, async () => {
        const { data } = await this.octokit.rest.pulls.create({
          owner: this.owner,
          repo: this.repo,
          ...params,
        });
        return data as unknown as GitHubPR;
      });
    } catch (err) {
      withPermissionHint(err, `Creating PR ${params.head}→${params.base}`);
    }
  }

  async getDefaultBranch(): Promise<string> {
    return this.withRetry("getDefaultBranch", async () => {
      const { data } = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo,
      });
      return data.default_branch;
    });
  }

  async listCommits(branch: string, since?: string): Promise<GitHubCommit[]> {
    return this.withRetry(`listCommits(${branch})`, async () => {
      const { data } = await this.octokit.rest.repos.listCommits({
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
      const { data } = await this.octokit.rest.repos.getCommit({
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
    try {
      return await this.withRetry(`createReview(PR #${params.pull_number})`, async () => {
        const { data } = await this.octokit.rest.pulls.createReview({
          owner: this.owner,
          repo: this.repo,
          ...params,
        });
        return data as unknown as GitHubReview;
      });
    } catch (err) {
      withPermissionHint(err, `Reviewing PR #${params.pull_number}`);
    }
  }

  async mergePR(params: {
    pull_number: number;
    merge_method?: "merge" | "squash" | "rebase";
  }): Promise<void> {
    try {
      return await this.withRetry(`mergePR(PR #${params.pull_number})`, async () => {
        await this.octokit.rest.pulls.merge({
          owner: this.owner,
          repo: this.repo,
          ...params,
          merge_method: params.merge_method ?? "squash",
        });
      });
    } catch (err) {
      withPermissionHint(err, `Merging PR #${params.pull_number}`);
    }
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
