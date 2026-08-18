export type TaskName =
  | "Agent_Issue_Analyzer"
  | "Agent_Commit_Analyzer"
  | "Agent_Tests_Generator"
  | "Agent_Tests_Report_Generator"
  | "Agent_Tests_Reviewer"
  | "Agent_Summarize";

export interface TaskResult {
  success: boolean;
  output: string;
  filesWritten?: string[];
  testsPassed?: number;
  testsFailed?: number;
  retries?: number;
}

export const ALL_TASKS: TaskName[] = [
  "Agent_Issue_Analyzer",
  "Agent_Commit_Analyzer",
  "Agent_Tests_Generator",
  "Agent_Tests_Report_Generator",
  "Agent_Tests_Reviewer",
  "Agent_Summarize",
];
