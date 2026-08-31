import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useAgentSocket } from "./ws";
import { Sidebar } from "./components/Sidebar";
import { JobCard, Markdown } from "./components/JobCard";
import { LogDrawer } from "./components/LogDrawer";
import { HumanApprovalPanel } from "./components/HumanApprovalPanel";
import { AgentStatusPanel } from "./components/AgentStatusPanel";
import { AgentPlanPanel } from "./components/AgentPlanPanel";
import { AgentStepsPanel } from "./components/AgentStepsPanel";
import { CheckpointPanel } from "./components/CheckpointPanel";

type UiMessage =
  | { kind: "text"; id: string; role: "user" | "assistant"; content: string }
  | { kind: "job"; id: string; jobId: string }
  | { kind: "summary"; id: string; jobId: string; title: string; markdown: string; logs: { level: string; message: string; timestamp: string }[] };

const WELCOME = `Hi! I'm the **MCalendar Test Agent** console. I can:

- 🐛 **Run the test pipeline** on any GitHub issue — try *"process issue #3"*
- 📦 **Analyze commits** — try *"process commit abc1234"*
- 📋 **List issues / retries** — *"what's pending?"*
- 🔍 **Answer questions** about this project — *"how does the auth service work?"*

What would you like to do?`;

let msgCounter = 0;
const nextId = () => `m${++msgCounter}`;

export default function App() {
  const [messages, setMessages] = useState<UiMessage[]>([
    { kind: "text", id: nextId(), role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [appConfig, setAppConfig] = useState<Awaited<ReturnType<typeof api.getConfig>> | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const { connected, logs, jobs, activity, retriesVersion, chatSummaries } = useAgentSocket();
  const shownJobsRef = useRef<Set<string>>(new Set());
  const shownSummariesRef = useRef<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thinkingRef = useRef(false);

  // Load app config
  useEffect(() => {
    api.getConfig().then(setAppConfig).catch(() => undefined);
  }, []);

  // Add incoming WS jobs as inline cards
  useEffect(() => {
    const additions: UiMessage[] = [];
    for (const [id, job] of jobs) {
      if (!shownJobsRef.current.has(id)) {
        shownJobsRef.current.add(id);
        additions.push({ kind: "job", id: nextId(), jobId: id });
      }
    }
    if (additions.length > 0) setMessages((prev) => [...prev, ...additions]);
  }, [jobs]);

  // Append chat-started job result summaries as summary messages
  useEffect(() => {
    const newSummaries = chatSummaries.filter((s) => !shownSummariesRef.current.has(s.id));
    if (newSummaries.length === 0) return;
    for (const s of newSummaries) shownSummariesRef.current.add(s.id);
    setMessages((prev) => [
      ...prev,
      ...newSummaries.map(
        (s): UiMessage => ({
          kind: "summary",
          id: `s${s.id}`,
          jobId: s.jobId,
          title: s.title,
          markdown: s.markdown,
          logs: s.logs,
        })
      ),
    ]);
  }, [chatSummaries]);

  // Autoscroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, activity]);

  thinkingRef.current = thinking;

  const compose = useCallback((text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || thinkingRef.current) return;

    setErrorBanner(null);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: UiMessage = { kind: "text", id: nextId(), role: "user", content: text };
    const historySnapshot = messages
      .filter((m): m is Extract<UiMessage, { kind: "text" }> => m.kind === "text")
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setThinking(true);

    try {
      const { reply } = await api.sendChat(text, historySnapshot);
      setMessages((prev) => [
        ...prev,
        { kind: "text", id: nextId(), role: "assistant", content: reply },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          kind: "text",
          id: nextId(),
          role: "assistant",
          content: `⚠️ **Error:** ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
      if (err instanceof Error && err.message.includes("already running")) {
        setErrorBanner("A job is already running — wait for it to finish.");
      }
    } finally {
      setThinking(false);
    }
  }, [input, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <div className="app">
      <Sidebar
        appConfig={appConfig}
        retriesVersion={retriesVersion}
        connected={connected}
        onCompose={compose}
      />

      <main className="main">
        <HumanApprovalPanel />
        
        {/* Agentic Panels */}
        <div className="agentic-panels">
          <AgentStatusPanel />
          <AgentPlanPanel />
          <AgentStepsPanel />
          <CheckpointPanel />
        </div>

        <div className="messages" ref={scrollRef}>
          {messages.map((msg) =>
            msg.kind === "text" ? (
              <div key={msg.id} className={`msg-row msg-${msg.role}`}>
                <div className="msg-bubble">
                  {msg.role === "assistant" ? <Markdown text={msg.content} /> : msg.content}
                </div>
              </div>
            ) : msg.kind === "summary" ? (
              <div key={msg.id} className="msg-row msg-assistant">
                <div className="msg-bubble">
                  <Markdown text={msg.markdown} />
                  {msg.logs.length > 0 && (
                    <details className="job-logs-details">
                      <summary>Agent Logs ({msg.logs.length} entries)</summary>
                      <div className="job-logs-body">
                        {msg.logs.map((log, i) => (
                          <div key={i} className={`log-line log-${log.level}`}>
                            <span className="log-ts">{log.timestamp.slice(11, 19)}</span>
                            <span className="log-msg">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            ) : (
              jobs.get(msg.jobId) && (
                <div key={msg.id} className="msg-row msg-job">
                  <JobCard job={jobs.get(msg.jobId)!} />
                </div>
              )
            )
          )}

          {thinking && (
            <div className="msg-row msg-assistant">
              <div className="msg-bubble thinking-bubble">
                {activity.length > 0 ? (
                  <>
                    <span className="thinking-label">Working…</span>
                    <div className="activity-chips">
                      {activity.map((a) => (
                        <span key={`${a.name}-${a.startedAt}`} className="chip chip-running">
                          ⚙️ {a.name}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="typing-dots"><i /><i /><i /></span>
                )}
              </div>
            </div>
          )}
        </div>

        {errorBanner && <div className="error-banner">{errorBanner}</div>}

        <div className="composer">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder={
              connected
                ? "Ask anything or give a command… (Enter to send, Shift+Enter for newline)"
                : "Disconnected — retrying connection…"
            }
            rows={1}
            disabled={!connected}
          />
          <button
            className="send-btn"
            onClick={() => void send()}
            disabled={!connected || thinking || input.trim().length === 0}
            title="Send"
          >
            ➤
          </button>
        </div>

        <LogDrawer logs={logs} />
      </main>
    </div>
  );
}
