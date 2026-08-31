import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { IssueSummary, JobStatus, RetriesResponse, MemoryStatsResponse } from "../api";

interface SidebarProps {
  appConfig: Awaited<ReturnType<typeof api.getConfig>> | null;
  retriesVersion: number;
  connected: boolean;
  onCompose: (text: string) => void;
}

export function Sidebar({ appConfig, retriesVersion, connected, onCompose }: SidebarProps) {
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [retries, setRetries] = useState<RetriesResponse | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [memoryStats, setMemoryStats] = useState<MemoryStatsResponse | null>(null);

  const refresh = useCallback(async () => {
    const [issuesRes, retriesRes, jobsRes, memoryRes] = await Promise.allSettled([
      api.getIssues(),
      api.getRetries(),
      api.getJobStatus(),
      api.getMemoryStats(),
    ]);
    if (issuesRes.status === "fulfilled") setIssues(issuesRes.value);
    if (retriesRes.status === "fulfilled") setRetries(retriesRes.value);
    if (jobsRes.status === "fulfilled") setJobStatus(jobsRes.value);
    if (memoryRes.status === "fulfilled") setMemoryStats(memoryRes.value);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 20000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [retriesVersion, refresh]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">🤖 MCalendar Agent</div>
        <div className="repo-line">
          {appConfig ? `${appConfig.repoOwner}/${appConfig.repoName}` : "…"}
        </div>
        <div className="badges">
          {appConfig && (
            <span className="badge">
              {appConfig.provider} · {shortenModel(appConfig.model)}
            </span>
          )}
          <span className={`badge ${connected ? "badge-ok" : "badge-err"}`}>
            {connected ? "live" : "offline"}
          </span>
          {appConfig && !appConfig.agentEnabled && (
            <span className="badge badge-warn" title="Set AGENT_ENABLED=true in .env">
              agent disabled
            </span>
          )}
          {appConfig && appConfig.memoryType === "local" && (
            <span className="badge badge-warn" title="Set MEMORY_TYPE=persistent in .env for cross-run memory">
              memory: local
            </span>
          )}
          {memoryStats && memoryStats.memoryType === "postgres" && (
            <span className="badge" title={`Memory entries: ${memoryStats.totalEntries}`}>
              memory: {memoryStats.totalEntries} entries
            </span>
          )}
        </div>
      </div>

      <Section
        title="Current Job"
        onRefresh={refresh}
      >
        {jobStatus?.current ? (
          <div className="job-mini running">
            <span className="spinner" />
            <span>{jobStatus.current.label}</span>
          </div>
        ) : (
          <div className="muted">Idle — no job running</div>
        )}
      </Section>

      <Section title={`Open Issues (${issues.length})`} onRefresh={refresh}>
        {issues.length === 0 && <div className="muted">No open issues</div>}
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue.number}>
              <button
                className="issue-btn"
                onClick={() =>
                  onCompose(`Process issue #${issue.number} (${issue.title}) — run the full test-generation pipeline.`)
                }
                title="Click to compose a processing prompt"
              >
                <span className="issue-num">#{issue.number}</span>
                <span className="issue-title">{issue.title}</span>
                {issue.labels.length > 0 && (
                  <span className="issue-labels">{issue.labels.map((l) => l.name).join(", ")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Retry Queue (${retryCount(retries)})`} onRefresh={refresh}>
        {retryCount(retries) === 0 ? (
          <div className="muted">Empty</div>
        ) : (
          <>
            {(retries?.issues ?? []).map((r) => (
              <div key={`i-${r.number}`} className="retry-item" title={r.lastError}>
                ⚠️ #{r.number} {r.title} ({r.attempts}×)
              </div>
            ))}
            {(retries?.commits ?? []).map((r) => (
              <div key={`c-${r.sha}`} className="retry-item" title={r.lastError}>
                ⚠️ {r.sha?.slice(0, 7)} {r.message} ({r.attempts}×)
              </div>
            ))}
            <button className="btn btn-small btn-danger" onClick={() => void handleClearRetries(refresh)}>
              Clear retries
            </button>
          </>
        )}
      </Section>

      {jobStatus && jobStatus.history.length > 0 && (
        <Section title="Recent Jobs" onRefresh={refresh}>
          {jobStatus.history.slice(0, 8).map((job) => (
            <div key={job.id} className={`job-mini ${job.status}`}>
              <span className={`dot dot-${job.status}`} />
              <span>{job.label}</span>
            </div>
          ))}
        </Section>
      )}

      <div className="sidebar-footer">
        Suggested prompts:
        <button className="prompt-chip" onClick={() => onCompose("List the open issues and summarize what each one needs.")}>
          Summarize open issues
        </button>
        <button className="prompt-chip" onClick={() => onCompose("Explain how this project is structured.")}>
          Explain project structure
        </button>
      </div>
    </aside>
  );
}

function retryCount(retries: RetriesResponse | null): number {
  if (!retries) return 0;
  return retries.issues.length + retries.commits.length;
}

async function handleClearRetries(refresh: () => Promise<void>) {
  await api.clearRetries();
  await refresh();
}

function shortenModel(model: string): string {
  return model.length > 22 ? `${model.slice(0, 22)}…` : model;
}

function Section({
  title,
  onRefresh,
  children,
}: {
  title: string;
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <div className="section">
      <div className="section-title">
        <span>{title}</span>
        <button className="refresh-btn" onClick={() => void onRefresh()} title="Refresh">
          ⟳
        </button>
      </div>
      {children}
    </div>
  );
}
