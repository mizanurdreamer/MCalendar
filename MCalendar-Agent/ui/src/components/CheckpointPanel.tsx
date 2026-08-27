import { useAgentSocket } from "../ws";

export function CheckpointPanel() {
  const { checkpoints } = useAgentSocket();

  if (checkpoints.length === 0) {
    return (
      <div className="checkpoint-panel">
        <div className="checkpoint-header">
          <span>Checkpoints</span>
          <span className="checkpoint-count">0 checkpoints</span>
        </div>
        <div className="muted">No checkpoints saved yet</div>
      </div>
    );
  }

  return (
    <div className="checkpoint-panel">
      <div className="checkpoint-header">
        <span>Checkpoints</span>
        <span className="checkpoint-count">{checkpoints.length} saved</span>
      </div>
      <div className="checkpoints-list">
        {checkpoints.map((cp, i) => (
          <div key={`${cp.runId}-${cp.step}-${i}`} className="checkpoint-item">
            <div className="checkpoint-main">
              <span className="checkpoint-step">Step {cp.step}</span>
              <span className="checkpoint-agent">{cp.agent}</span>
              <span className="checkpoint-status">{cp.status}</span>
            </div>
            <div className="checkpoint-meta">
              <span className="checkpoint-run">Run: {cp.runId.slice(0, 20)}…</span>
              <span className="checkpoint-time">{new Date(cp.timestamp).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}