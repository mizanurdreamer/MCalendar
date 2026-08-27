import { useAgentSocket } from "../ws";

export function AgentStepsPanel() {
  const { agentSteps, agentPlans } = useAgentSocket();
  const steps = [...agentSteps].reverse(); // Most recent first

  const getStepColor = (status: string) => {
    switch (status) {
      case "pending": return "step-pending";
      case "running": return "step-running";
      case "completed": return "step-completed";
      case "failed": return "step-failed";
      default: return "step-pending";
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case "pending": return "⏳";
      case "running": return "🔄";
      case "completed": return "✅";
      case "failed": return "❌";
      default: return "⏳";
    }
  };

  if (steps.length === 0) {
    return (
      <div className="agent-steps-panel">
        <div className="agent-steps-header">
          <span>Agent Steps</span>
          <span className="step-count">0 steps</span>
        </div>
        <div className="muted">No steps executed yet</div>
      </div>
    );
  }

  return (
    <div className="agent-steps-panel">
      <div className="agent-steps-header">
        <span>Agent Steps</span>
        <span className="step-count">{steps.length} steps</span>
      </div>
      <div className="steps-list">
        {steps.map((step, i) => (
          <div key={`${step.agent}-${step.stepId}-${i}`} className={`step-item ${getStepColor(step.status)}`}>
            <div className="step-header">
              <span className="step-agent">{step.agent}</span>
              <span className="step-icon">{getStepIcon(step.status)}</span>
              <span className="step-status">{step.status}</span>
            </div>
            <div className="step-details">
              <div className="step-tool-row">
                <span className="step-tool-label">Tool:</span>
                <span className="step-tool-value">{step.tool}</span>
              </div>
              <div className="step-outcome-row">
                <span className="step-outcome-label">Outcome:</span>
                <span className="step-outcome-value">{step.expectedOutcome}</span>
              </div>
              {step.reasoning && (
                <div className="step-reasoning">
                  <span className="step-reasoning-label">Reasoning:</span>
                  <span className="step-reasoning-value">{step.reasoning}</span>
                </div>
              )}
              <div className="step-timing">
                {step.startedAt && (
                  <span className="step-time">Started: {new Date(step.startedAt).toLocaleTimeString()}</span>
                )}
                {step.completedAt && (
                  <span className="step-time">Completed: {new Date(step.completedAt).toLocaleTimeString()}</span>
                )}
                {step.startedAt && step.completedAt && (
                  <span className="step-duration">
                    Duration: {(step.completedAt - step.startedAt) / 1000}s
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}