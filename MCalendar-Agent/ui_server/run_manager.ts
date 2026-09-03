import { randomUUID } from "node:crypto";
import type { AppConfig } from "../src/config/config.js";
import type { TaskResult } from "../src/utils/types.js";
import type { GitHubIssue } from "../src/github/types.js";
import { GitHubClient } from "../src/github/client.js";
import { processIssue } from "../src/orchestrator/issue_orchestrator.js";
import { processCommit } from "../src/orchestrator/commit_orchestrator.js";
import { StateManager } from "../src/watcher/issue_state_tracker.js";
import { CommitStateManager } from "../src/watcher/commit_state_tracker.js";
import { logger } from "../src/utils/logger.js";
import { broadcast } from "./ws_hub.js";
import { PIPELINE_STATUS, MODE } from "../src/utils/constants.js";
import { winstonInstance } from "../src/utils/logger.js";
import Transport from "winston-transport";

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
const MAX_CHAT_LOGS = 100;

interface LogCapture {
  level: string;
  message: string;
  timestamp: string;
}

class LogCollector extends Transport {
  private logs: LogCapture[] = [];
  private collecting = false;

  start(): void {
    this.logs = [];
    this.collecting = true;
    winstonInstance.add(this);
  }

  stop(): void {
    this.collecting = false;
    try { winstonInstance.remove(this); } catch { /* ignore */ }
  }

  getLogs(): LogCapture[] {
    return this.logs.slice(-MAX_CHAT_LOGS);
  }

  log(info: { level?: string; message?: unknown }, callback: () => void): void {
    setImmediate(() => {
      if (this.collecting) {
        const raw = typeof info.message === "string" ? info.message : String(info.message ?? "");
        this.logs.push({
          level: info.level ?? "info",
          message: raw.length > 4000 ? `${raw.slice(0, 4000)}…` : raw,
          timestamp: new Date().toISOString(),
        });
      }
      callback();
    });
  }
}

export class RunManager {
  private config: AppConfig;
  private current: JobInfo | null = null;
  private history: JobInfo[] = [];
  private abortController: AbortController | null = null;

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

  stop(): boolean {
    if (!this.current || !this.abortController) return false;
    logger.info(`[job] Stopping — ${this.current.label}`);
    this.abortController.abort();
    return true;
  }

  async runIssue(issueNumber: number, opts: JobStartOptions = {}): Promise<JobInfo> {
    const github = this.createGithubClient();
    let issue: GitHubIssue;
    try {
      issue = await github.getIssue(issueNumber);
    } catch (err) {
      const job: JobInfo = {
        id: randomUUID(),
        type: MODE.ISSUE,
        label: `Issue #${issueNumber}`,
        ref: String(issueNumber),
        status: PIPELINE_STATUS.FAILED,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        error: `Failed to fetch issue: ${err instanceof Error ? err.message : err}`,
        source: opts.source,
      };
      this.history.unshift(job);
      if (this.history.length > HISTORY_LIMIT) this.history.pop();
      this.broadcastJob(job);
      return job;
    }

    const job: JobInfo = {
      id: randomUUID(),
      type: MODE.ISSUE,
      label: `Issue #${issue.number}: ${truncate(issue.title, 60)}`,
      ref: String(issueNumber),
      status: PIPELINE_STATUS.RUNNING,
      startedAt: Date.now(),
      source: opts.source,
    };

    return this.execute(job, (signal) =>
      processIssue(issue, {
        agentConfig: this.config.agentConfig,
        githubClient: github,
        codebasePath: this.config.codebasePath,
        testProjectPath: this.config.testProjectPath,
        testReviewMaxRetries: this.config.testReviewMaxRetries,
        maxIterations: this.config.maxIterations,
        maxPipelineSteps: this.config.maxPipelineSteps,
        projectName: this.config.projectName,
        baseBranch: this.config.watchBranch,
        databaseUrl: this.config.databaseUrl,
        agentMemoryDatabaseUrl: this.config.agentMemoryDatabaseUrl,
        apiBaseUrl: this.config.apiBaseUrl,
        commitAutoApprove: this.config.commitAutoApprove,
        memoryType: this.config.memoryType,
        abortSignal: signal,
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
    let targetBranch: string;
    let diff: Awaited<ReturnType<GitHubClient["getCommitDiff"]>>;
    try {
      targetBranch = branch ?? this.config.watchBranch ?? (await github.getDefaultBranch());
      diff = await github.getCommitDiff(sha);
    } catch (err) {
      const job: JobInfo = {
        id: randomUUID(),
        type: MODE.COMMIT,
        label: `Commit ${sha.slice(0, 7)}`,
        ref: sha,
        status: PIPELINE_STATUS.FAILED,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        error: `Failed to fetch commit: ${err instanceof Error ? err.message : err}`,
        source: opts.source,
      };
      this.history.unshift(job);
      if (this.history.length > HISTORY_LIMIT) this.history.pop();
      this.broadcastJob(job);
      return job;
    }

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

    return this.execute(job, (signal) =>
      processCommit(diff, {
        agentConfig: this.config.agentConfig,
        githubClient: github,
        codebasePath: this.config.codebasePath,
        testProjectPath: this.config.testProjectPath,
        testReviewMaxRetries: this.config.testReviewMaxRetries,
        maxIterations: this.config.maxIterations,
        maxPipelineSteps: this.config.maxPipelineSteps,
        targetBranch,
        projectName: this.config.projectName,
        databaseUrl: this.config.databaseUrl,
        agentMemoryDatabaseUrl: this.config.agentMemoryDatabaseUrl,
        apiBaseUrl: this.config.apiBaseUrl,
        commitAutoApprove: this.config.commitAutoApprove,
        memoryType: this.config.memoryType,
        abortSignal: signal,
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
    fn: (signal: AbortSignal) => Promise<TaskResult & { skipped?: boolean }>
  ): Promise<JobInfo> {
    if (this.current) {
      throw new Error(
        `Another job is already running (${this.current.label}). Wait for it to finish.`
      );
    }

    this.abortController = new AbortController();
    this.current = job;
    this.broadcastJob(job);
    logger.info(`[job:${job.type}] Started — ${job.label}`);

    const logCollector = new LogCollector();
    logCollector.start();

    try {
      const result = await fn(this.abortController.signal);
      if (this.abortController.signal.aborted) {
        job.status = PIPELINE_STATUS.FAILED;
        job.error = "Job stopped by user";
        logger.info(`[job:${job.type}] Stopped by user — ${job.label}`);
      } else {
        job.result = result;
        job.status = result.success ? PIPELINE_STATUS.COMPLETED : PIPELINE_STATUS.FAILED;
        if (!result.success) job.error = truncate(result.output ?? "Unknown failure", 500);
        logger.info(`[job:${job.type}] ${job.status === PIPELINE_STATUS.COMPLETED ? "Finished" : "Failed"} — ${job.label}`);
      }
    } catch (err) {
      if (this.abortController.signal.aborted) {
        job.status = PIPELINE_STATUS.FAILED;
        job.error = "Job stopped by user";
        logger.info(`[job:${job.type}] Stopped by user — ${job.label}`);
      } else {
        job.status = PIPELINE_STATUS.FAILED;
        job.error = String(err instanceof Error ? err.message : err);
        logger.error(`[job:${job.type}] Failed — ${job.label}: ${job.error}`);
      }
    } finally {
      logCollector.stop();
      job.finishedAt = Date.now();
      this.current = null;
      this.abortController = null;
      this.history.unshift(job);
      if (this.history.length > HISTORY_LIMIT) this.history.pop();
      this.broadcastJob(job);
      if (job.source === "chat") {
        const jobLogs = logCollector.getLogs();
        broadcast({
          type: "chat:summary",
          jobId: job.id,
          title: job.label,
          markdown: formatJobResult(job),
          logs: jobLogs,
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