export type TaskName =
  | "Agent_Analyze_Issue"
  | "Agent_Analyze_Commit"
  | "Agent_Generate_Tests"
  | "Agent_Review_Tests"
  | "Agent_Fix_Tests"
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
  "Agent_Analyze_Issue",
  "Agent_Analyze_Commit",
  "Agent_Generate_Tests",
  "Agent_Review_Tests",
  "Agent_Fix_Tests",
  "Agent_Summarize",
];
