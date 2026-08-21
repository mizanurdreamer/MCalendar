import { readJson, writeJson } from "../utils/file.js";
import path from "node:path";

interface BranchState {
  lastSeenSha: string | null;
  checkedAt: string;
  retryHistory?: { attempt: number; errors: string[]; analysis?: string }[];
}

export interface PendingCommitRetry {
  sha: string;
  message: string;
  attempts: number;
  lastError: string;
  queuedAt: string;
}

interface CommitStateFile {
  branches: Record<string, BranchState>;
  pendingCommitRetries?: PendingCommitRetry[];
}

const DEFAULT_STATE: CommitStateFile = { branches: {} };

export class CommitStateManager {
  private statePath: string;

  constructor(stateDir: string) {
    this.statePath = path.join(stateDir, "commit-state.json");
  }

  private load(): CommitStateFile {
    try {
      return readJson<CommitStateFile>(this.statePath);
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  private save(state: CommitStateFile): void {
    writeJson(this.statePath, state);
  }

  getLastSeenSha(branch: string): string | null {
    const state = this.load();
    return state.branches[branch]?.lastSeenSha ?? null;
  }

  updateBranch(branch: string, sha: string): void {
    const state = this.load();
    state.branches[branch] = {
      lastSeenSha: sha,
      checkedAt: new Date().toISOString(),
    };
    this.save(state);
  }

  updateAfterProcessing(sha: string, info: { status?: string; retryHistory?: { attempt: number; errors: string[]; analysis?: string }[] }): void {
    const state = this.load();
    for (const branch of Object.keys(state.branches)) {
      if (state.branches[branch].lastSeenSha === sha) {
        state.branches[branch].checkedAt = new Date().toISOString();
        if (info.retryHistory) {
          state.branches[branch].retryHistory = info.retryHistory;
        }
        this.save(state);
        return;
      }
    }
  }

  enqueueCommitRetry(sha: string, message: string, error: string): void {
    const state = this.load();
    state.pendingCommitRetries ??= [];
    if (state.pendingCommitRetries.some((r) => r.sha === sha)) return;
    state.pendingCommitRetries.push({
      sha,
      message: message.split("\n")[0].slice(0, 200),
      attempts: 1,
      lastError: error.slice(0, 500),
      queuedAt: new Date().toISOString(),
    });
    this.save(state);
  }

  getDueCommitRetries(): PendingCommitRetry[] {
    return this.load().pendingCommitRetries ?? [];
  }

  resolveCommitRetry(sha: string): void {
    const state = this.load();
    if (!state.pendingCommitRetries?.length) return;
    state.pendingCommitRetries = state.pendingCommitRetries.filter((r) => r.sha !== sha);
    this.save(state);
  }

  markCommitRetryFailed(sha: string, error: string, maxRetries: number): boolean {
    const state = this.load();
    if (!state.pendingCommitRetries) return false;
    const entry = state.pendingCommitRetries.find((r) => r.sha === sha);
    if (!entry) return false;

    entry.attempts += 1;
    entry.lastError = error.slice(0, 500);

    if (entry.attempts > maxRetries) {
      state.pendingCommitRetries = state.pendingCommitRetries.filter((r) => r.sha !== sha);
      this.save(state);
      return false;
    }

    this.save(state);
    return true;
  }

  clearCommitRetries(): number {
    const state = this.load();
    const count = state.pendingCommitRetries?.length ?? 0;
    if (count > 0) {
      state.pendingCommitRetries = [];
      this.save(state);
    }
    return count;
  }
}
