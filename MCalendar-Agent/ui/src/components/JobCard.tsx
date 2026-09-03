import { marked } from "marked";
import DOMPurify from "dompurify";
import type { JobInfo } from "../api";
import type { AgentStep } from "../ws";

export function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

function formatAgentName(name: string): string {
  return name
    .replace(/^agent_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stepIcon(status: string) {
  switch (status) {
    case "completed": return "✓";
    case "running": return "◉";
    default: return "○";
  }
}

export function JobCard({ job, currentAgent, agentSteps }: {
  job: JobInfo;
  currentAgent?: { agent: string; status: string } | null;
  agentSteps?: AgentStep[];
}) {
  const running = job.status === "running";
  const runningSteps = agentSteps?.filter((s) => s.status === "running" || s.status === "completed").slice(-4) ?? [];
  const activeStep = agentSteps?.find((s) => s.status === "running");

  return (
    <div className={`job-card job-${job.status}`}>
      <div className="job-card-header">
        <span className="job-icon">{job.type === "issue" ? "🐛" : "📦"}</span>
        <span className="job-label">{job.label}</span>
        {running && <span className="spinner" />}
        {!running && (
          <span className={`dot dot-${job.status}`} />
        )}
      </div>

      {running && currentAgent && (
        <div className="job-thought-bubble">
          <div className="thought-agent">
            <span className="spinner spinner-small" />
            <span className="thought-agent-name">{formatAgentName(currentAgent.agent)}</span>
          </div>

          {runningSteps.length > 0 && (
            <div className="thought-steps">
              {runningSteps.map((step, i) => (
                <div key={`${step.stepId}-${i}`} className={`thought-step step-${step.status}`}>
                  <span className="step-icon">{stepIcon(step.status)}</span>
                  <span className="step-tool">{step.tool}</span>
                  {step.status === "running" && (
                    <span className="step-label">running</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!activeStep && runningSteps.length === 0 && (
            <div className="thought-waiting">Thinking...</div>
          )}
        </div>
      )}

      {running && <div className="progress-bar"><div className="progress-fill" /></div>}

      {!running && job.result && !job.result.skipped && (
        <div className="job-stats">
          {typeof job.result.testsPassed === "number" && (
            <>
              <span className="stat stat-pass">✔ {job.result.testsPassed} passed</span>
              {!!job.result.testsFailed && <span className="stat stat-fail">✘ {job.result.testsFailed} failed</span>}
            </>
          )}
          {job.result.testsPassed === 0 && job.result.testsFailed === 0 && job.result.filesWritten && job.result.filesWritten.length > 0 && (
            <span className="stat stat-warn">⚠ 0 tests executed</span>
          )}
          {job.result.filesWritten && job.result.filesWritten.length > 0 && (
            <div className="job-files">
              {job.result.filesWritten.map((f) => (
                <span key={f} className="stat file-stat">📝 {f}</span>
              ))}
            </div>
          )}
          {job.result.reportPath && (
            <span className="stat">📄 <a href={job.result.reportPath} target="_blank" rel="noopener noreferrer">View Report</a></span>
          )}
        </div>
      )}

      {!running && job.status === "failed" && (
        <div className="job-error">{job.error ?? "Job failed"}</div>
      )}
    </div>
  );
}
