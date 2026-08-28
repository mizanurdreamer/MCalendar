import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/config.js";
import type { TaskResult } from "../utils/types.js";
import type { GitHubIssue } from "../github/types.js";
import { GitHubClient } from "../github/client.js";
import { processIssue } from "../orchestrator/issue_orchestrator.js";
import { processCommit } from "../orchestrator/commit_orchestrator.js";
import { StateManager } from "../watcher/issue_state_tracker.js";
import { CommitStateManager } from "../watcher/commit_state_tracker.js";
import { logger } from "../utils/logger.js";
import { broadcast } from "./ws_hub.js";
import { PIPELINE_STATUS, MODE } from "../utils/constants.js";

export interface JobInfo {
  id: string;
  type: "issue" | "commit";
  label: string;
  ref: string;
  branch?: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  finishedAt?: number;
  result?: (TaskResult & { skipped?: boolean }) | null;
  error?: string;
  source?: "chat" | "api";
}

export interface JobStartOptions {
  source?: "chat" | "api";
}

const HISTORY_LIMIT = 20;

export class RunManager {
  private config: AppConfig;
  private current: JobInfo | null = null;
  private history: JobInfo[] = [];

  constructor(config: AppConfig) {
    this.config = config;
  }

  getStatus(): { busy: boolean; current: JobInfo | null; history: JobInfo[] } {
    return {
      busy: this.current !== null,
      current: this.current,
      history: [...this.history],
    };
  }

  async runIssue(issueNumber: number, opts: JobStartOptions = {}): Promise<JobInfo> {
    const github = this.createGithubClient();
    const issue = await github.getIssue(issueNumber);

    const job: JobInfo = {
      id: randomUUID(),
      type: MODE.ISSUE,
      label: `Issue #${issue.number}: ${truncate(issue.title, 60)}`,
      ref: String(issueNumber),
      status: PIPELINE_STATUS.RUNNING,
      startedAt: Date.now(),
      source: opts.source,
    };

    return this.execute(job, () =>
      processIssue(issue, {
        agentConfig: this.config.agentConfig,
        githubClient: github,
        codebasePath: this.config.codebasePath,
        testProjectPath: this.config.testProjectPath,
        maxRetries: this.config.maxRetries,
        maxIterations: this.config.maxIterations,
        maxPipelineSteps: this.config.maxPipelineSteps,
        projectName: this.config.projectName,
        baseBranch: this.config.watchBranch,
        databaseUrl: this.config.databaseUrl,
        apiBaseUrl: this.config.apiBaseUrl,
        commitAutoApprove: this.config.commitAutoApprove,
      })
    ).then((finished) => {
      if (finished.status === PIPELINE_STATUS.COMPLETED) {
        new StateManager("state").resolveIssueRetry(issueNumber);
      }
      return finished;
    });
  }

  async runCommit(sha: string, branch?: string, opts: JobStartOptions = {}): Promise<JobInfo> {
    const github = this.createGithubClient();
    const targetBranch =
      branch ?? this.config.watchBranch ?? (await github.getDefaultBranch());
    const diff = await github.getCommitDiff(sha);

    const job: JobInfo = {
      id: randomUUID(),
      type: MODE.COMMIT,
      label: `Commit ${sha.slice(0, 7)}: ${truncate(diff.message.split("\n")[0] ?? "", 50)}`,
      ref: sha,
      branch: targetBranch,
      status: PIPELINE_STATUS.RUNNING,
      startedAt: Date.now(),
      source: opts.source,
    };

    return this.execute(job, () =>
      processCommit(diff, {
        agentConfig: this.config.agentConfig,
        githubClient: github,
        codebasePath: this.config.codebasePath,
        testProjectPath: this.config.testProjectPath,
        maxRetries: this.config.maxRetries,
        maxIterations: this.config.maxIterations,
        maxPipelineSteps: this.config.maxPipelineSteps,
        targetBranch,
        projectName: this.config.projectName,
        databaseUrl: this.config.databaseUrl,
        apiBaseUrl: this.config.apiBaseUrl,
        commitAutoApprove: this.config.commitAutoApprove,
      })
    ).then((finished) => {
      if (finished.status === PIPELINE_STATUS.COMPLETED) {
        new CommitStateManager("state").resolveCommitRetry(sha);
      }
      return finished;
    });
  }

  private createGithubClient(): GitHubClient {
    return new GitHubClient(
      this.config.githubToken,
      this.config.repoOwner,
      this.config.repoName,
      this.config.githubMaxRetries
    );
  }

  private async execute(
    job: JobInfo,
    fn: () => Promise<TaskResult & { skipped?: boolean }>
  ): Promise<JobInfo> {
    if (this.current) {
      throw new Error(
        `Another job is already running (${this.current.label}). Wait for it to finish.`
      );
    }

    this.current = job;
    this.broadcastJob(job);
    logger.info(`[job:${job.type}] Started — ${job.label}`);

    try {
      const result = await fn();
      job.result = result;
      job.status = result.success ? PIPELINE_STATUS.COMPLETED : PIPELINE_STATUS.FAILED;
      if (!result.success) job.error = truncate(result.output ?? "Unknown failure", 500);
      logger.info(`[job:${job.type}] ${job.status === PIPELINE_STATUS.COMPLETED ? "Finished" : "Failed"} — ${job.label}`);
    } catch (err) {
      job.status = PIPELINE_STATUS.FAILED;
      job.error = String(err instanceof Error ? err.message : err);
      logger.error(`[job:${job.type}] Failed — ${job.label}: ${job.error}`);
    } finally {
      job.finishedAt = Date.now();
      this.current = null;
      this.history.unshift(job);
      if (this.history.length > HISTORY_LIMIT) this.history.pop();
      this.broadcastJob(job);
      if (job.source === "chat") {
        broadcast({
          type: "chat:summary",
          jobId: job.id,
          title: job.label,
          markdown: formatJobResult(job),
        });
      }
    }

    return job;
  }

  private broadcastJob(job: JobInfo): void {
    broadcast({ type: "job:update", job: JSON.parse(JSON.stringify(job)) });
    if (job.status !== PIPELINE_STATUS.RUNNING) {
      broadcast({ type: "job:result", job: JSON.parse(JSON.stringify(job)) });
    }
  }
}

export function formatJobResult(job: JobInfo): string {
  const durationSec = job.finishedAt
    ? Math.round((job.finishedAt - job.startedAt) / 1000)
    : null;
  const durationLine = durationSec !== null ? `\n_Duration: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s_` : "";

  if (job.status === PIPELINE_STATUS.FAILED) {
    return `❌ **Job failed:** ${job.label}${durationLine}\n\n\`${job.error ?? job.result?.output ?? "unknown error"}\``;
  }
  const r = job.result;
  if (!r) return `✅ **Finished:** ${job.label}${durationLine}`;
  if (r.skipped) {
    return `⏭️ **Skipped:** ${job.label}${durationLine}\n\n${r.output}`;
  }
  const parts = [`✅ **Completed:** ${job.label}${durationLine}`, "", r.output];
  if (typeof r.testsPassed === "number" || typeof r.testsFailed === "number") {
    parts.push("", `**Tests:** ${r.testsPassed ?? 0} passed / ${r.testsFailed ?? 0} failed`);
  }
  if (r.filesWritten?.length) {
    parts.push(`**Test files:** ${r.filesWritten.map((f) => `\`${f}\``).join(", ")}`);
  }
  if (r.reportPath) {
    parts.push(`📄 **Report:** \`${r.reportPath}\``);
  }
  return parts.join("\n");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}