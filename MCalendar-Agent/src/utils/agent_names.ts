export const AGENT_NAMES = {
  ISSUE_ANALYZER: "agent_issue_analyzer",
  COMMIT_ANALYZER: "agent_commit_analyzer",
  TESTS_GENERATOR: "agent_tests_generator",
  TESTS_REVIEWER: "agent_tests_reviewer",
  TESTS_REPORT_GENERATOR: "agent_tests_report_generator",
  SUMMARIZE: "agent_summarize",
} as const;

export type AgentName = (typeof AGENT_NAMES)[keyof typeof AGENT_NAMES];
