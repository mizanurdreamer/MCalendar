import { useState, useCallback } from "react";
import { api } from "../api";
import type { CommitSummary, JobInfo } from "../api";

interface BranchCommitPanelProps {
  onJobStarted?: (job: JobInfo) => void;
}

export function BranchCommitPanel({ onJobStarted }: BranchCommitPanelProps) {
  const [branch, setBranch] = useState("main");
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    if (!branch.trim()) return;
    setScanning(true);
    setError(null);
    setCommits([]);
    try {
      const result = await api.getBranchCommits(branch.trim());
      setCommits(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan branch");
    } finally {
      setScanning(false);
    }
  }, [branch]);

  const handleProcess = useCallback(async (commitSha: string) => {
    setProcessing(commitSha);
    setError(null);
    try {
      const job = await api.startBranchCommitJob(branch.trim());
      onJobStarted?.(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start job");
    } finally {
      setProcessing(null);
    }
  }, [branch, onJobStarted]);

  return (
    <div className="branch-commit-panel">
      <div className="branch-input-row">
        <input
          type="text"
          className="branch-input"
          placeholder="Enter branch name (e.g., main)"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleScan()}
          disabled={scanning}
        />
        <button
          className="btn btn-small"
          onClick={handleScan}
          disabled={scanning || !branch.trim()}
        >
          {scanning ? "Scanning..." : "Scan"}
        </button>
      </div>

      {error && <div className="branch-error">{error}</div>}

      {commits.length > 0 && (
        <div className="commit-list">
          {commits.map((commit) => (
            <div key={commit.sha} className="commit-item">
              <div className="commit-info">
                <span className="commit-sha">{commit.shortSha}</span>
                <span className="commit-message" title={commit.message}>
                  {commit.message.length > 40
                    ? commit.message.slice(0, 40) + "..."
                    : commit.message}
                </span>
              </div>
              <button
                className="btn btn-small btn-process"
                onClick={() => handleProcess(commit.sha)}
                disabled={processing !== null}
              >
                {processing === commit.sha ? "Processing..." : "Process"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!scanning && commits.length === 0 && !error && (
        <div className="muted">Enter your working branch name to scan recent commits</div>
      )}
    </div>
  );
}
