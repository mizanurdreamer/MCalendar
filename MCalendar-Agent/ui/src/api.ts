export interface IssueSummary {
  number: number;
  title: string;
  labels: { name: string }[];
  url: string;
}

export interface JobResult {
  success: boolean;
  output: string;
  skipped?: boolean;
  filesWritten?: string[];
  testsPassed?: number;
  testsFailed?: number;
}

export interface JobInfo {
  id: string;
  type: "issue" | "commit";
  label: string;
  ref: string;
  branch?: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  finishedAt?: number;
  result?: JobResult | null;
  error?: string;
}

export interface JobStatus {
  busy: boolean;
  current: JobInfo | null;
  history: JobInfo[];
}

export interface PendingRetry {
  kind?: string;
  number?: number;
  sha?: string;
  title?: string;
  message?: string;
  attempts: number;
  lastError: string;
}

export interface RetriesResponse {
  issues: PendingRetry[];
  commits: PendingRetry[];
}

export interface AppConfigResponse {
  repoOwner: string;
  repoName: string;
  projectName: string;
  provider: string;
  model: string;
  agentEnabled: boolean;
  codebasePath: string;
  testProjectPath: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  getConfig: () => request<AppConfigResponse>("/api/config"),
  getIssues: () => request<IssueSummary[]>("/api/issues"),
  getJobStatus: () => request<JobStatus>("/api/job"),
  getRetries: () => request<RetriesResponse>("/api/retries"),
  clearRetries: () => request<{ cleared: number }>("/api/retries/clear", { method: "POST" }),
  startIssueJob: (number: number) =>
    request<JobInfo>("/api/jobs/issue", { method: "POST", body: JSON.stringify({ number }) }),
  sendChat: (message: string, history: { role: "user" | "assistant"; content: string }[]) =>
    request<{ reply: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
};
