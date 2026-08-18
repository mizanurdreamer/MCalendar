import { readJson, writeJson } from "../utils/file.js";
import path from "node:path";

export interface ProcessedState {
  lastProcessedIssueNumber: number;
  lastProcessedAt: string | null;
  history: HistoryEntry[];
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
}
