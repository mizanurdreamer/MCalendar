import { useAgentSocket } from "../ws";

export function AgentPlanPanel() {
  const { agentPlans } = useAgentSocket();
  const plans = Array.from(agentPlans.values());

  if (plans.length === 0) {
    return (
      <div className="agent-plan-panel">
        <div className="agent-plan-header">
          <span>Execution Plans</span>
          <span className="plan-count">0 plans</span>
        </div>
        <div className="muted">No plans generated yet</div>
      </div>
    );
  }

  return (
    <div className="agent-plan-panel">
      <div className="agent-plan-header">
        <span>Execution Plans</span>
        <span className="plan-count">{plans.length} plans</span>
      </div>
      {plans.map((plan) => (
        <div key={plan.agent} className="plan-card">
          <div className="plan-header">
            <span className="plan-agent">{plan.agent}</span>
            <span className={`plan-risk risk-${plan.riskLevel}`}>{plan.riskLevel}</span>
          </div>
          <div className="plan-goal">{plan.goal}</div>
          <div className="plan-steps">
            {plan.steps.map((step: any, i: number) => (
              <div key={`${plan.agent}-${i}`} className="plan-step">
                <span className="step-number">{i + 1}</span>
                <span className="step-tool">{step.tool}</span>
                <span className="step-outcome">{step.expectedOutcome}</span>
                {step.canRunParallel && <span className="step-parallel">⚡ parallel</span>}
              </div>
            ))}
          </div>
          {plan.parallelGroups && plan.parallelGroups.length > 0 && (
            <div className="plan-parallel-groups">
              <span className="parallel-label">Parallel groups:</span>
              {plan.parallelGroups.map((group: string[], i: number) => (
                <span key={i} className="parallel-group">[{group.join(", ")}]</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}