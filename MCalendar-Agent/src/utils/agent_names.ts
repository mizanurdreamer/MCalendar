export const AGENT_NAMES = {
  AGENT_ISSUE_ANALYZER: "agent_issue_analyzer",
  AGENT_COMMIT_ANALYZER: "agent_commit_analyzer",
  AGENT_TESTS_GENERATOR: "agent_tests_generator",
  AGENT_TESTS_REVIEWER: "agent_tests_reviewer",
  AGENT_TESTS_REPORT_GENERATOR: "agent_tests_report_generator",
  AGENT_SUMMARIZE: "agent_summarize",
  AGENT_CODE_FIXER: "agent_code_fixer",
} as const;

export type AgentName = (typeof AGENT_NAMES)[keyof typeof AGENT_NAMES];
