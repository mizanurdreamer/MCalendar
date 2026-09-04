// ═══════════════════════════════════════════════════════════
// MCalendar Agent — String Constants
// ═══════════════════════════════════════════════════════════

// --- Agent Status (BaseAgent lifecycle) ---
export const AGENT_STATUS = {
  IDLE: "idle",
  PLANNING: "planning",
  EXECUTING: "executing",
  REFLECTING: "reflecting",
  AWAITING_APPROVAL: "awaiting_approval",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

// --- Pipeline Status (AgentState.status) ---
export const PIPELINE_STATUS = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  AWAITING_HUMAN: "awaiting_human",
} as const;

// --- Routing Decision Actions ---
export const ROUTING_ACTION = {
  ROUTE: "route",
  PARALLEL: "parallel",
  WAIT: "wait",
  COMPLETE: "complete",
  FAIL: "fail",
  REPLAN: "replan",
  REQUEST_APPROVAL: "request_approval",
} as const;

// --- Core Agent Names (non-worker agents) ---
export const CORE_AGENT_NAMES = {
  SUPERVISOR: "supervisor",
  CRITIC: "critic",
  PLANNER: "planner",
} as const;

// --- Graph Node Names ---
export const GRAPH_NODE = {
  SUPERVISOR: "supervisor",
  CRITIC: "critic",
  HUMAN_APPROVAL: "human_approval",
  RUN_TESTS: "run_tests",
} as const;

// --- Run Mode ---
export const MODE = {
  ISSUE: "issue",
  COMMIT: "commit",
} as const;

// --- Approval Resolution ---
export const APPROVAL_RESOLUTION = {
  APPROVE: "approve",
  REJECT: "reject",
} as const;

// --- Approval Type ---
export const APPROVAL_TYPE = {
  PLAN: "plan",
  TEST_GENERATION: "test_generation",
  COMMIT_PUSH: "commit_push",
  PR_CREATION: "pr_creation",
  ARCHITECTURE_DECISION: "architecture_decision",
} as const;

// --- Risk Level ---
export const RISK_LEVEL = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

// --- Message Type ---
export const MESSAGE_TYPE = {
  BROADCAST: "broadcast",
  REQUEST: "request",
  RESPONSE: "response",
  NOTIFICATION: "notification",
  DELEGATION: "delegation",
  FEEDBACK: "feedback",
} as const;

// --- Agent Events (for MessageBus communication) ---
export const AGENT_EVENT = {
  ISSUE_ANALYZED: "issue_analyzed",
  COMMIT_ANALYZED: "commit_analyzed",
  TESTS_GENERATED: "tests_generated",
  TESTS_REVIEWED: "tests_reviewed",
  REPORT_GENERATED: "report_generated",
  SUMMARY_CREATED: "summary_created",
  CODE_FIXED: "code_fixed",
} as const;

// --- Approved By ---
export const APPROVED_BY = {
  HUMAN: "human",
  SUPERVISOR: "supervisor",
} as const;
