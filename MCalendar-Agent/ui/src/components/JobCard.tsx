import { marked } from "marked";
import DOMPurify from "dompurify";
import type { JobInfo } from "../api";

export function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function JobCard({ job }: { job: JobInfo }) {
  const running = job.status === "running";
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

      {running && <div className="progress-bar"><div className="progress-fill" /></div>}

      {!running && job.result && !job.result.skipped && (
        <div className="job-stats">
          {typeof job.result.testsPassed === "number" && (
            <>
              <span className="stat stat-pass">✔ {job.result.testsPassed} passed</span>
              {!!job.result.testsFailed && <span className="stat stat-fail">✘ {job.result.testsFailed} failed</span>}
            </>
          )}
          {job.result.filesWritten && job.result.filesWritten.length > 0 && (
            <span className="stat">📝 {job.result.filesWritten.length} test file(s)</span>
          )}
        </div>
      )}

      {!running && job.status === "failed" && (
        <div className="job-error">{job.error ?? "Job failed"}</div>
      )}
    </div>
  );
}
