import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../ws";

interface LiveLogStreamProps {
  logs: LogEntry[];
  running: boolean;
  startedAt?: number;
}

export function LiveLogStream({ logs, running, startedAt }: LiveLogStreamProps) {
  const [open, setOpen] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Filter logs to only show those from this job execution
  const filteredLogs = startedAt
    ? logs.filter((l) => new Date(l.timestamp).getTime() >= startedAt)
    : logs;

  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [filteredLogs, open]);

  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // Auto-open when running, allow manual toggle
  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);

  if (!running && filteredLogs.length === 0) return null;

  return (
    <div className={`live-log-stream ${open ? "open" : ""} ${running ? "active" : ""}`}>
      <button className="live-log-toggle" onClick={() => setOpen(!open)}>
        {running && <span className="live-dot" />}
        {open ? "▾" : "▴"} Live Logs {running ? `(${filteredLogs.length})` : `— done (${filteredLogs.length})`}
      </button>
      <div className="live-log-body" ref={bodyRef} onScroll={handleScroll}>
        {filteredLogs.length === 0 && running && (
          <div className="muted">Waiting for agent output…</div>
        )}
        {filteredLogs.map((entry) => (
          <div key={entry.id} className={`log-line log-${entry.level}`}>
            <span className="log-ts">{entry.timestamp.slice(11, 19)}</span>
            <span className="log-msg">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
