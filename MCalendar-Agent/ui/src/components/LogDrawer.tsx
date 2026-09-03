import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../ws";

export function LogDrawer({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [logs, open]);

  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div className={`log-drawer ${open ? "open" : ""}`}>
      <div className="log-toggle-row">
        <button className="log-toggle" onClick={() => setOpen(!open)}>
          {open ? "▾" : "▴"} Agent Logs ({logs.length})
        </button>
        {logs.length > 0 && (
          <button className="log-clear-btn" onClick={onClear} title="Clear logs">
            Clear
          </button>
        )}
      </div>
      <div className="log-body" ref={bodyRef} onScroll={handleScroll}>
        {logs.length === 0 && <div className="muted">Waiting for agent activity…</div>}
        {logs.map((entry) => (
          <div key={entry.id} className={`log-line log-${entry.level}`}>
            <span className="log-ts">{entry.timestamp.slice(11)}</span>
            <span className="log-msg">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
