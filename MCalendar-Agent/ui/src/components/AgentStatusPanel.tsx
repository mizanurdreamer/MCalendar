import { useAgentSocket } from "../ws";

export function AgentStatusPanel() {
  const { agentStatuses } = useAgentSocket();
  const statuses = Array.from(agentStatuses.values());

  const getStatusColor = (status: string) => {
    switch (status) {
      case "idle": return "status-idle";
      case "planning": return "status-planning";
      case "executing": return "status-executing";
      case "reflecting": return "status-reflecting";
      case "awaiting_approval": return "status-awaiting";
      case "completed": return "status-completed";
      case "failed": return "status-failed";
      default: return "status-idle";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "idle": return "⏸";
      case "planning": return "📋";
      case "executing": return "⚙️";
      case "reflecting": return "🤔";
      case "awaiting_approval": return "🔔";
      case "completed": return "✅";
      case "failed": return "❌";
      default: return "⏸";
    }
  };

  if (statuses.length === 0) {
    return (
      <div className="agent-status-panel">
        <div className="agent-status-header">
          <span>Agent Status</span>
          <span className="agent-count">0 agents</span>
        </div>
        <div className="muted">No agent activity yet</div>
      </div>
    );
  }

  return (
    <div className="agent-status-panel">
      <div className="agent-status-header">
        <span>Agent Status</span>
        <span className="agent-count">{statuses.length} agents</span>
      </div>
      <div className="agent-status-grid">
        {statuses.map((s) => (
          <div key={s.agent} className={`agent-status-card ${getStatusColor(s.status)}`}>
            <div className="agent-status-top">
              <span className="agent-name">{s.agent}</span>
              <span className="agent-icon">{getStatusIcon(s.status)}</span>
            </div>
            <div className="agent-status-label">{s.status.replace("_", " ")}</div>
            <div className="agent-updated">
              {new Date(s.updatedAt).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}