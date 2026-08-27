import { useState, useCallback } from "react";
import { useAgentSocket } from "../ws";
import { api } from "../api";

interface ApprovalRequest {
  id: string;
  agent: string;
  type: "plan" | "test_generation" | "commit_push" | "pr_creation" | "architecture_decision";
  title: string;
  description: string;
  data: any;
  options: { label: string; value: string }[];
  defaultOption?: string;
  createdAt: number;
  requestedAt?: number;
}

export function HumanApprovalPanel() {
  const { pendingApprovals: wsApprovals } = useAgentSocket();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  // Merge WebSocket approvals with any locally tracked ones
  const pendingApprovals = wsApprovals as ApprovalRequest[];

  const handleResolve = useCallback(async (requestId: string, resolution: string) => {
    setResolving(requestId);
    try {
      await api.resolveApproval(requestId, resolution);
      // The WebSocket will send "human:approval:resolved" event to remove it
    } catch (err) {
      console.error("[ApprovalPanel] Failed to resolve approval:", err);
    } finally {
      setResolving(null);
    }
  }, []);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getTypeColor = (type: ApprovalRequest["type"]) => {
    switch (type) {
      case "plan": return "plan";
      case "test_generation": return "test";
      case "commit_push": return "commit";
      case "pr_creation": return "pr";
      case "architecture_decision": return "arch";
      default: return "default";
    }
  };

  if (pendingApprovals.length === 0) {
    return null;
  }

  return (
    <div className="approval-panel">
      <div className="approval-header">
        <h3>🔔 Pending Approvals ({pendingApprovals.length})</h3>
      </div>
      {pendingApprovals.map((approval) => (
        <div key={approval.id} className={`approval-card ${getTypeColor(approval.type)}`}>
          <div className="approval-summary" onClick={() => setExpandedId(approval.id === expandedId ? null : approval.id)}>
            <div className="approval-title">
              <span className="approval-agent">[{approval.agent}]</span>
              <span className="approval-type">{approval.type.replace("_", " ")}</span>
              <span className="approval-time">{formatTime(approval.requestedAt || approval.createdAt)}</span>
            </div>
            <div className="approval-desc">{approval.title}</div>
            <span className="expand-icon">{expandedId === approval.id ? "▲" : "▼"}</span>
          </div>
          
          {expandedId === approval.id && (
            <div className="approval-details">
              <pre className="approval-data">{JSON.stringify(approval.data, null, 2)}</pre>
              <div className="approval-actions">
                {approval.options.map((opt) => (
                  <button
                    key={opt.value}
                    className={`btn-approval ${opt.value === approval.defaultOption ? "primary" : "secondary"}`}
                    onClick={() => handleResolve(approval.id, opt.value)}
                    disabled={resolving === approval.id}
                  >
                    {resolving === approval.id ? "⏳" : opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}