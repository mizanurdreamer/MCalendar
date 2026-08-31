import type { AppConfig } from "../src/config/config.js";
import type { TaskResult } from "../src/utils/types.js";
export interface JobInfo {
    id: string;
    type: "issue" | "commit";
    label: string;
    ref: string;
    branch?: string;
    status: "running" | "completed" | "failed";
    startedAt: number;
    finishedAt?: number;
    result?: (TaskResult & {
        skipped?: boolean;
    }) | null;
    error?: string;
    source?: "chat" | "api";
}
export interface JobStartOptions {
    source?: "chat" | "api";
}
export declare class RunManager {
    private config;
    private current;
    private history;
    constructor(config: AppConfig);
    getStatus(): {
        busy: boolean;
        current: JobInfo | null;
        history: JobInfo[];
    };
    runIssue(issueNumber: number, opts?: JobStartOptions): Promise<JobInfo>;
    runCommit(sha: string, branch?: string, opts?: JobStartOptions): Promise<JobInfo>;
    private createGithubClient;
    private execute;
    private broadcastJob;
}
export declare function formatJobResult(job: JobInfo): string;
