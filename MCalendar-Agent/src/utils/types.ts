import { AGENT_NAMES, type AgentName } from "./agent_names.js";

export type { AgentName } from "./agent_names.js";

export type TaskName = AgentName;

export interface TaskResult {
  success: boolean;
  output: string;
  filesWritten?: string[];
  testsPassed?: number;
  testsFailed?: number;
  retries?: number;
  retryHistory?: { attempt: number; errors: string[]; analysis?: string }[];
  report?: string;
  reportPath?: string;
}

export const ALL_TASKS: TaskName[] = [
  AGENT_NAMES.AGENT_ISSUE_ANALYZER,
  AGENT_NAMES.AGENT_COMMIT_ANALYZER,
  AGENT_NAMES.AGENT_TESTS_GENERATOR,
  AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR,
  AGENT_NAMES.AGENT_TESTS_REVIEWER,
  AGENT_NAMES.AGENT_SUMMARIZE,
];
