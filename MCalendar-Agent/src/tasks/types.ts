export type TaskName =
  | "analyze_issue"
  | "generate_tests"
  | "review_tests"
  | "fix_tests"
  | "summarize";

export interface TaskResult {
  success: boolean;
  output: string;
  filesWritten?: string[];
  testsPassed?: number;
  testsFailed?: number;
  retries?: number;
}

export const ALL_TASKS: TaskName[] = [
  "analyze_issue",
  "generate_tests",
  "review_tests",
  "fix_tests",
  "summarize",
];
