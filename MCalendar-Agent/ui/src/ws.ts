import { useEffect, useRef, useState } from "react";
import type { JobInfo } from "./api";

export type WsEvent =
  | { type: "connected" }
  | { type: "log"; level: string; message: string; timestamp: string }
  | { type: "job:update"; job: JobInfo }
  | { type: "job:result"; job: JobInfo }
  | { type: "chat:activity"; phase: "start" | "end"; name: string }
  | { type: "chat:summary"; jobId: string; title: string; markdown: string }
  | { type: "retries:update" };

export interface LogEntry {
  id: number;
  level: string;
  message: string;
  timestamp: string;
}

export interface ChatSummary {
  id: number;
  jobId: string;
  title: string;
  markdown: string;
}

const MAX_LOGS = 400;

export function useAgentSocket() {
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [jobs, setJobs] = useState<Map<string, JobInfo>>(new Map());
  const [activity, setActivity] = useState<{ name: string; startedAt: number }[]>([]);
  const [retriesVersion, setRetriesVersion] = useState(0);
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);
  const logIdRef = useRef(0);
  const summaryIdRef = useRef(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${proto}//${location.host}/ws`);

      socket.onopen = () => setConnected(true);

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsEvent;
          handleMessage(msg);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (!closed) retryTimer = setTimeout(connect, 2000);
      };

      socket.onerror = () => socket?.close();
    };

    const handleMessage = (msg: WsEvent) => {
      switch (msg.type) {
        case "log": {
          const entry: LogEntry = {
            id: ++logIdRef.current,
            level: msg.level,
            message: msg.message,
            timestamp: msg.timestamp,
          };
          setLogs((prev) => {
            const next = [...prev, entry];
            return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
          });
          break;
        }
        case "job:update":
        case "job:result": {
          const job = msg.job;
          setJobs((prev) => {
            const next = new Map(prev);
            next.set(job.id, job);
            return next;
          });
          break;
        }
        case "chat:activity": {
          setActivity((prev) =>
            msg.phase === "start"
              ? [...prev, { name: msg.name, startedAt: Date.now() }]
              : prev.filter((a) => a.name !== msg.name)
          );
          break;
        }
        case "chat:summary": {
          setChatSummaries((prev) => [
            ...prev,
            { id: ++summaryIdRef.current, jobId: msg.jobId, title: msg.title, markdown: msg.markdown },
          ]);
          break;
        }
        case "retries:update":
          setRetriesVersion((v) => v + 1);
          break;
      }
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return { connected, logs, jobs, activity, retriesVersion, chatSummaries };
}
