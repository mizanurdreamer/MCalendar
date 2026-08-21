import { readJson, writeJson } from "../utils/file.js";
import path from "node:path";

export interface PendingIssueRetry {
  number: number;
  title: string;
  attempts: number;
  lastError: string;
  queuedAt: string;
}

export interface ProcessedState {
  lastProcessedIssueNumber: number;
  lastProcessedAt: string | null;
  history: HistoryEntry[];
  retries?: PendingIssueRetry[];
}

export interface HistoryEntry {
  number: number;
  title: string;
  status: "completed" | "failed";
  branch?: string;
  prNumber?: number;
  testsPassed?: number;
  testsFailed?: number;
  retries?: number;
  retryHistory?: { attempt: number; errors: string[]; analysis?: string }[];
  processedAt: string;
}

const DEFAULT_STATE: ProcessedState = {
  lastProcessedIssueNumber: 0,
  lastProcessedAt: null,
  history: [],
};

export class StateManager {
  private statePath: string;

  constructor(stateDir: string) {
    this.statePath = path.join(stateDir, "processed.json");
  }

  load(): ProcessedState {
    try {
      return readJson<ProcessedState>(this.statePath);
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  save(state: ProcessedState): void {
    writeJson(this.statePath, state);
  }

  getLastProcessedNumber(): number {
    return this.load().lastProcessedIssueNumber;
  }

  updateAfterProcessing(
    issueNumber: number,
    title: string,
    result: {
      status: "completed" | "failed";
      branch?: string;
      prNumber?: number;
      testsPassed?: number;
      testsFailed?: number;
      retries?: number;
      retryHistory?: { attempt: number; errors: string[]; analysis?: string }[];
    }
  ): void {
    const state = this.load();
    state.lastProcessedIssueNumber = Math.max(state.lastProcessedIssueNumber, issueNumber);
    state.lastProcessedAt = new Date().toISOString();
    state.history.push({
      number: issueNumber,
      title,
      processedAt: new Date().toISOString(),
      ...result,
    });
    this.save(state);
  }

  enqueueIssueRetry(issueNumber: number, title: string, error: string): void {
    const state = this.load();
    state.retries ??= [];
    if (state.retries.some((r) => r.number === issueNumber)) return;
    state.retries.push({
      number: issueNumber,
      title,
      attempts: 1,
      lastError: error.slice(0, 500),
      queuedAt: new Date().toISOString(),
    });
    this.save(state);
  }

  getDueIssueRetries(): PendingIssueRetry[] {
    return this.load().retries ?? [];
  }

  resolveIssueRetry(issueNumber: number): void {
    const state = this.load();
    if (!state.retries?.length) return;
    state.retries = state.retries.filter((r) => r.number !== issueNumber);
    this.save(state);
  }

  markIssueRetryFailed(issueNumber: number, error: string, maxRetries: number): boolean {
    const state = this.load();
    if (!state.retries) return false;
    const entry = state.retries.find((r) => r.number === issueNumber);
    if (!entry) return false;

    entry.attempts += 1;
    entry.lastError = error.slice(0, 500);

    if (entry.attempts > maxRetries) {
      state.retries = state.retries.filter((r) => r.number !== issueNumber);
      this.save(state);
      return false;
    }

    this.save(state);
    return true;
  }

  clearIssueRetries(): number {
    const state = this.load();
    const count = state.retries?.length ?? 0;
    if (count > 0) {
      state.retries = [];
      this.save(state);
    }
    return count;
  }
}
