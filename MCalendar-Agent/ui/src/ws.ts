import { useEffect, useRef, useState } from "react";
import type { JobInfo } from "./api";

export type WsEvent =
  | { type: "connected" }
  | { type: "log"; level: string; message: string; timestamp: string }
  | { type: "job:update"; job: JobInfo }
  | { type: "job:result"; job: JobInfo }
  | { type: "chat:activity"; phase: "start" | "end"; name: string }
  | { type: "chat:summary"; jobId: string; title: string; markdown: string; logs?: { level: string; message: string; timestamp: string }[] }
  | { type: "retries:update" }
  // Agentic events
  | { type: "agent:status"; agent: string; status: string; timestamp: string }
  | { type: "agent:plan"; agent: string; plan: any; timestamp: string }
  | { type: "agent:step"; agent: string; step: any; timestamp: string }
  | { type: "agent:reflection"; agent: string; reflection: any; timestamp: string }
  | { type: "checkpoint:saved"; runId: string; step: number; agent: string; timestamp: string }
  | { type: "human:approval:requested"; request: any }
  | { type: "human:approval:resolved"; requestId: string; resolution: string; timestamp: string };

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
  logs: { level: string; message: string; timestamp: string }[];
}

export interface AgentStatus {
  agent: string;
  status: "idle" | "planning" | "executing" | "reflecting" | "awaiting_approval" | "completed" | "failed";
  updatedAt: number;
}

export interface AgentPlan {
  agent: string;
  goal: string;
  steps: any[];
  estimatedIterations: number;
  riskLevel: "low" | "medium" | "high";
  createdAt: number;
  parallelGroups?: string[][];
}

export interface AgentStep {
  agent: string;
  stepId: string;
  tool: string;
  args: any;
  expectedOutcome: string;
  reasoning: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
}

export interface Reflection {
  agent: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  shouldRevise: boolean;
  timestamp: number;
}

export interface Checkpoint {
  runId: string;
  step: number;
  agent: string;
  timestamp: number;
  status: string;
}

const MAX_LOGS = 400;

export function useAgentSocket() {
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [jobs, setJobs] = useState<Map<string, JobInfo>>(new Map());
  const [activity, setActivity] = useState<{ name: string; startedAt: number }[]>([]);
  const [retriesVersion, setRetriesVersion] = useState(0);
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);
  // Agentic state
  const [agentStatuses, setAgentStatuses] = useState<Map<string, AgentStatus>>(new Map());
  const [agentPlans, setAgentPlans] = useState<Map<string, AgentPlan>>(new Map());
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [currentAgent, setCurrentAgent] = useState<{ agent: string; status: string } | null>(null);
  const logIdRef = useRef(0);
  const summaryIdRef = useRef(0);
  const stepIdRef = useRef(0);

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
            { id: ++summaryIdRef.current, jobId: msg.jobId, title: msg.title, markdown: msg.markdown, logs: msg.logs ?? [] },
          ]);
          break;
        }
        case "retries:update":
          setRetriesVersion((v) => v + 1);
          break;
        // Agentic events
        case "agent:status": {
          setAgentStatuses((prev) => {
            const next = new Map(prev);
            next.set(msg.agent, {
              agent: msg.agent,
              status: msg.status as AgentStatus["status"],
              updatedAt: Date.parse(msg.timestamp) || Date.now(),
            });
            return next;
          });
          // Track current executing agent
          if (msg.status === "executing") {
            setCurrentAgent({ agent: msg.agent, status: msg.status });
          } else if (msg.status === "completed" || msg.status === "failed") {
            setCurrentAgent((prev) => prev?.agent === msg.agent ? null : prev);
          }
          break;
        }
        case "agent:plan": {
          setAgentPlans((prev) => {
            const next = new Map(prev);
            next.set(msg.agent, { ...msg.plan, agent: msg.agent, createdAt: Date.parse(msg.timestamp) || Date.now() });
            return next;
          });
          break;
        }
        case "agent:step": {
          setAgentSteps((prev) => {
            const existing = prev.findIndex(s => s.stepId === msg.step.stepId && s.agent === msg.agent);
            const step: AgentStep = {
              agent: msg.agent,
              stepId: msg.step.stepId,
              tool: msg.step.tool,
              args: msg.step.args,
              expectedOutcome: msg.step.expectedOutcome,
              reasoning: msg.step.reasoning,
              status: msg.step.status,
              startedAt: msg.step.startedAt,
              completedAt: msg.step.completedAt,
            };
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = step;
              return next;
            }
            return [...prev, step];
          });
          break;
        }
        case "agent:reflection": {
          setReflections((prev) => [
            ...prev,
            { ...msg.reflection, agent: msg.agent, timestamp: Date.parse(msg.timestamp) || Date.now() },
          ].slice(-50));
          break;
        }
        case "checkpoint:saved": {
          setCheckpoints((prev) => [
            { runId: msg.runId, step: msg.step, agent: msg.agent, timestamp: Date.parse(msg.timestamp) || Date.now(), status: "saved" },
            ...prev,
          ].slice(-20));
          break;
        }
        case "human:approval:requested": {
          setPendingApprovals((prev) => [...prev, { ...msg.request, requestedAt: Date.now() }]);
          break;
        }
        case "human:approval:resolved": {
          setPendingApprovals((prev) => prev.filter(a => a.id !== msg.requestId));
          break;
        }
      }
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return { 
    connected, 
    logs, 
    jobs, 
    activity, 
    retriesVersion, 
    chatSummaries,
    // Agentic
    agentStatuses,
    agentPlans,
    agentSteps,
    reflections,
    checkpoints,
    pendingApprovals,
    currentAgent,
  };
}
