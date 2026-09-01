import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../ws";

interface ToolActivity {
  name: string;
  startedAt: number;
}

interface ToolActivityItemProps {
  tool: ToolActivity;
  logs: LogEntry[];
  completed: boolean;
}

function formatToolName(name: string): string {
  const map: Record<string, string> = {
    list_issues: "Listing issues",
    get_issue: "Fetching issue",
    process_issue: "Processing issue",
    process_commit: "Processing commit",
    check_job_status: "Checking job status",
    list_retries: "Listing retries",
    clear_retries: "Clearing retries",
    read_codebase_file: "Reading file",
    list_codebase_directory: "Listing directory",
  };
  return map[name] || name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ToolActivityItem({ tool, logs, completed }: ToolActivityItemProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const toolLogs = logs.filter((l) => {
    const ts = new Date(l.timestamp).getTime();
    return ts >= tool.startedAt && (l.message.toLowerCase().includes(tool.name) || l.message.includes(`chat:${tool.name}`));
  });

  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [toolLogs]);

  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // Auto-collapse completed items after 1.5s
  useEffect(() => {
    if (completed) {
      const timer = setTimeout(() => setExpanded(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [completed]);

  return (
    <div className={`tool-activity-item ${completed ? "completed" : "running"}`}>
      <button className="tool-activity-header" onClick={() => completed && setExpanded(!expanded)}>
        <span className="tool-activity-icon">
          {!completed ? (
            <span className="spinner" />
          ) : (
            <span className="tool-checkmark">✓</span>
          )}
        </span>
        <span className="tool-activity-name">{formatToolName(tool.name)}</span>
        {completed && toolLogs.length > 0 && (
          <span className="tool-expand-icon">{expanded ? "▾" : "▸"}</span>
        )}
      </button>
      {completed && expanded && toolLogs.length > 0 && (
        <div className="tool-activity-details" ref={bodyRef} onScroll={handleScroll}>
          {toolLogs.map((log, i) => (
            <div key={i} className={`log-line log-${log.level}`}>
              <span className="log-ts">{log.timestamp.slice(11, 19)}</span>
              <span className="log-msg">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ToolActivityListProps {
  activity: ToolActivity[];
  logs: LogEntry[];
  running: boolean;
}

export function ToolActivityList({ activity, logs, running }: ToolActivityListProps) {
  const [completedTools, setCompletedTools] = useState<ToolActivity[]>([]);
  const prevActivityRef = useRef<ToolActivity[]>([]);

  // Track tools that just completed
  useEffect(() => {
    const prevNames = new Set(prevActivityRef.current.map((a) => a.name));
    const currentNames = new Set(activity.map((a) => a.name));

    for (const prev of prevActivityRef.current) {
      if (!currentNames.has(prev.name)) {
        // This tool just completed
        setCompletedTools((ct) => {
          // Avoid duplicates
          if (ct.some((t) => t.name === prev.name && t.startedAt === prev.startedAt)) return ct;
          return [...ct, prev];
        });
      }
    }

    prevActivityRef.current = activity;
  }, [activity]);

  // Clear completed tools when not running
  useEffect(() => {
    if (!running) {
      const timer = setTimeout(() => {
        setCompletedTools([]);
        prevActivityRef.current = [];
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [running]);

  const allTools = [
    ...completedTools.map((t) => ({ ...t, completed: true })),
    ...activity.map((t) => ({ ...t, completed: false })),
  ];

  if (allTools.length === 0 && !running) return null;

  return (
    <div className="tool-activity-list">
      {allTools.length === 0 && running && (
        <div className="tool-activity-item running">
          <span className="tool-activity-icon">
            <span className="spinner" />
          </span>
          <span className="tool-activity-name muted">Thinking...</span>
        </div>
      )}
      {allTools.map((tool) => (
        <ToolActivityItem
          key={`${tool.name}-${tool.startedAt}`}
          tool={tool}
          logs={logs}
          completed={tool.completed}
        />
      ))}
    </div>
  );
}
