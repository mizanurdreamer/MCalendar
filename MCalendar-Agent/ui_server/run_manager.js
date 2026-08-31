import { randomUUID } from "node:crypto";
import { GitHubClient } from "../src/github/client.js";
import { processIssue } from "../src/orchestrator/issue_orchestrator.js";
import { processCommit } from "../src/orchestrator/commit_orchestrator.js";
import { StateManager } from "../src/watcher/issue_state_tracker.js";
import { CommitStateManager } from "../src/watcher/commit_state_tracker.js";
import { logger } from "../src/utils/logger.js";
import { broadcast } from "./ws_hub.js";
import { PIPELINE_STATUS, MODE } from "../src/utils/constants.js";
const HISTORY_LIMIT = 20;
export class RunManager {
    config;
    current = null;
    history = [];
    constructor(config) {
        this.config = config;
    }
    getStatus() {
        return {
            busy: this.current !== null,
            current: this.current,
            history: [...this.history],
        };
    }
    async runIssue(issueNumber, opts = {}) {
        const github = this.createGithubClient();
        const issue = await github.getIssue(issueNumber);
        const job = {
            id: randomUUID(),
            type: MODE.ISSUE,
            label: `Issue #${issue.number}: ${truncate(issue.title, 60)}`,
            ref: String(issueNumber),
            status: PIPELINE_STATUS.RUNNING,
            startedAt: Date.now(),
            source: opts.source,
        };
        return this.execute(job, () => processIssue(issue, {
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
            agentMemoryDatabaseUrl: this.config.agentMemoryDatabaseUrl,
            apiBaseUrl: this.config.apiBaseUrl,
            commitAutoApprove: this.config.commitAutoApprove,
            memoryType: this.config.memoryType,
        })).then((finished) => {
            if (finished.status === PIPELINE_STATUS.COMPLETED) {
                new StateManager("state").resolveIssueRetry(issueNumber);
            }
            return finished;
        });
    }
    async runCommit(sha, branch, opts = {}) {
        const github = this.createGithubClient();
        const targetBranch = branch ?? this.config.watchBranch ?? (await github.getDefaultBranch());
        const diff = await github.getCommitDiff(sha);
        const job = {
            id: randomUUID(),
            type: MODE.COMMIT,
            label: `Commit ${sha.slice(0, 7)}: ${truncate(diff.message.split("\n")[0] ?? "", 50)}`,
            ref: sha,
            branch: targetBranch,
            status: PIPELINE_STATUS.RUNNING,
            startedAt: Date.now(),
            source: opts.source,
        };
        return this.execute(job, () => processCommit(diff, {
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
            agentMemoryDatabaseUrl: this.config.agentMemoryDatabaseUrl,
            apiBaseUrl: this.config.apiBaseUrl,
            commitAutoApprove: this.config.commitAutoApprove,
            memoryType: this.config.memoryType,
        })).then((finished) => {
            if (finished.status === PIPELINE_STATUS.COMPLETED) {
                new CommitStateManager("state").resolveCommitRetry(sha);
            }
            return finished;
        });
    }
    createGithubClient() {
        return new GitHubClient(this.config.githubToken, this.config.repoOwner, this.config.repoName, this.config.githubMaxRetries);
    }
    async execute(job, fn) {
        if (this.current) {
            throw new Error(`Another job is already running (${this.current.label}). Wait for it to finish.`);
        }
        this.current = job;
        this.broadcastJob(job);
        logger.info(`[job:${job.type}] Started — ${job.label}`);
        try {
            const result = await fn();
            job.result = result;
            job.status = result.success ? PIPELINE_STATUS.COMPLETED : PIPELINE_STATUS.FAILED;
            if (!result.success)
                job.error = truncate(result.output ?? "Unknown failure", 500);
            logger.info(`[job:${job.type}] ${job.status === PIPELINE_STATUS.COMPLETED ? "Finished" : "Failed"} — ${job.label}`);
        }
        catch (err) {
            job.status = PIPELINE_STATUS.FAILED;
            job.error = String(err instanceof Error ? err.message : err);
            logger.error(`[job:${job.type}] Failed — ${job.label}: ${job.error}`);
        }
        finally {
            job.finishedAt = Date.now();
            this.current = null;
            this.history.unshift(job);
            if (this.history.length > HISTORY_LIMIT)
                this.history.pop();
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
    broadcastJob(job) {
        broadcast({ type: "job:update", job: JSON.parse(JSON.stringify(job)) });
        if (job.status !== PIPELINE_STATUS.RUNNING) {
            broadcast({ type: "job:result", job: JSON.parse(JSON.stringify(job)) });
        }
    }
}
export function formatJobResult(job) {
    const durationSec = job.finishedAt
        ? Math.round((job.finishedAt - job.startedAt) / 1000)
        : null;
    const durationLine = durationSec !== null ? `\n_Duration: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s_` : "";
    if (job.status === PIPELINE_STATUS.FAILED) {
        return `❌ **Job failed:** ${job.label}${durationLine}\n\n\`${job.error ?? job.result?.output ?? "unknown error"}\``;
    }
    const r = job.result;
    if (!r)
        return `✅ **Finished:** ${job.label}${durationLine}`;
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
function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
//# sourceMappingURL=run_manager.js.map