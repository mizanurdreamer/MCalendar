export type TaskName =
  | "agent_issue_analyzer"
  | "agent_commit_analyzer"
  | "agent_tests_generator"
  | "agent_tests_report_generator"
  | "agent_tests_reviewer"
  | "agent_summarize";

export interface TaskResult {
  success: boolean;
  output: string;
  filesWritten?: string[];
  testsPassed?: number;
  testsFailed?: number;
  retries?: number;
  retryHistory?: { attempt: number; errors: string[]; analysis?: string }[];
}

export const ALL_TASKS: TaskName[] = [
  "agent_issue_analyzer",
  "agent_commit_analyzer",
  "agent_tests_generator",
  "agent_tests_report_generator",
  "agent_tests_reviewer",
  "agent_summarize",
];
