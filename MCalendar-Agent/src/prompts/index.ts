import { AGENT_ISSUE_ANALYZER_PROMPT } from "./issue_analyzer_prompt.js";
import { AGENT_COMMIT_ANALYZER_PROMPT } from "./commit_analyzer_prompt.js";
import { AGENT_TESTS_GENERATOR_PROMPT } from "./tests_generator_prompt.js";
import { AGENT_TESTS_REVIEWER_PROMPT } from "./tests_reviewer_prompt.js";
import { AGENT_TESTS_REPORT_GENERATOR_PROMPT } from "./tests_report_generator_prompt.js";
import { AGENT_SUMMARIZE_PROMPT } from "./summarize_prompt.js";

export const SYSTEM_PROMPTS: Record<string, string> = {
  Agent_Issue_Analyzer: AGENT_ISSUE_ANALYZER_PROMPT,
  Agent_Commit_Analyzer: AGENT_COMMIT_ANALYZER_PROMPT,
  Agent_Tests_Generator: AGENT_TESTS_GENERATOR_PROMPT,
  Agent_Tests_Reviewer: AGENT_TESTS_REVIEWER_PROMPT,
  Agent_Tests_Report_Generator: AGENT_TESTS_REPORT_GENERATOR_PROMPT,
  Agent_Summarize: AGENT_SUMMARIZE_PROMPT,
};

export {
  AGENT_ISSUE_ANALYZER_PROMPT,
  AGENT_COMMIT_ANALYZER_PROMPT,
  AGENT_TESTS_GENERATOR_PROMPT,
  AGENT_TESTS_REVIEWER_PROMPT,
  AGENT_TESTS_REPORT_GENERATOR_PROMPT,
  AGENT_SUMMARIZE_PROMPT,
};
