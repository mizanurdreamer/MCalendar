import { readJson, writeJson } from "../utils/file.js";
import path from "node:path";

interface BranchState {
  lastSeenSha: string | null;
  checkedAt: string;
  retryHistory?: { attempt: number; errors: string[]; analysis?: string }[];
}

interface CommitStateFile {
  branches: Record<string, BranchState>;
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
}
