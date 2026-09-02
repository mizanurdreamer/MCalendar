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

export interface ApprovalRequest {
  id: string;
  agent: string;
  type: "plan" | "test_generation" | "commit_push" | "pr_creation" | "architecture_decision";
  title: string;
  description: string;
  data: any;
  options: { label: string; value: string }[];
  defaultOption?: string;
  createdAt: number;
  resolved?: boolean;
  resolution?: string;
}

export interface ApprovalsResponse {
  approvals: ApprovalRequest[];
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
  memoryType: "local" | "postgres";
}

export interface MemoryStatsResponse {
  memoryType: "local" | "postgres";
  totalEntries: number;
  byType: Record<string, number>;
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
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
  getIssues: (status?: string) =>
    request<IssueSummary[]>(`/api/issues${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  getJobStatus: () => request<JobStatus>("/api/job"),
  getRetries: () => request<RetriesResponse>("/api/retries"),
  clearRetries: () => request<{ cleared: number }>("/api/retries/clear", { method: "POST" }),
  getMemoryStats: () => request<MemoryStatsResponse>("/api/memory/stats"),
  startIssueJob: (number: number) =>
    request<JobInfo>("/api/jobs/issue", { method: "POST", body: JSON.stringify({ number }) }),
  sendChat: (message: string, history: { role: "user" | "assistant"; content: string }[]) =>
    request<{ reply: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
  getPendingApprovals: () => request<ApprovalsResponse>("/api/approvals"),
  resolveApproval: (id: string, resolution: string) =>
    request<{ ok: boolean }>("/api/approvals/resolve", {
      method: "POST",
      body: JSON.stringify({ id, resolution }),
    }),
  getBranchCommits: (branch: string, limit?: number) =>
    request<CommitSummary[]>(`/api/branches/${encodeURIComponent(branch)}/commits?limit=${limit ?? 10}`),
  startBranchCommitJob: (branch: string) =>
    request<JobInfo>("/api/jobs/branch-commit", {
      method: "POST",
      body: JSON.stringify({ branch }),
    }),
  stopJob: () => request<{ stopped: boolean }>("/api/jobs/stop", { method: "POST" }),
};
