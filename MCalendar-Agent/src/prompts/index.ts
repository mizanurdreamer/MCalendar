import { AGENT_ISSUE_ANALYZER_PROMPT } from "./issue_analyzer_prompt.js";
import { AGENT_COMMIT_ANALYZER_PROMPT } from "./commit_analyzer_prompt.js";
import { AGENT_TESTS_GENERATOR_PROMPT } from "./tests_generator_prompt.js";
import { AGENT_TESTS_REVIEWER_PROMPT } from "./tests_reviewer_prompt.js";
import { AGENT_TESTS_REPORT_GENERATOR_PROMPT } from "./tests_report_generator_prompt.js";
import { AGENT_SUMMARIZE_PROMPT } from "./summarize_prompt.js";

export const SYSTEM_PROMPTS: Record<string, string> = {
  agent_issue_analyzer: AGENT_ISSUE_ANALYZER_PROMPT,
  agent_commit_analyzer: AGENT_COMMIT_ANALYZER_PROMPT,
  agent_tests_generator: AGENT_TESTS_GENERATOR_PROMPT,
  agent_tests_reviewer: AGENT_TESTS_REVIEWER_PROMPT,
  agent_tests_report_generator: AGENT_TESTS_REPORT_GENERATOR_PROMPT,
  agent_summarize: AGENT_SUMMARIZE_PROMPT,
};

export {
  AGENT_ISSUE_ANALYZER_PROMPT,
  AGENT_COMMIT_ANALYZER_PROMPT,
  AGENT_TESTS_GENERATOR_PROMPT,
  AGENT_TESTS_REVIEWER_PROMPT,
  AGENT_TESTS_REPORT_GENERATOR_PROMPT,
  AGENT_SUMMARIZE_PROMPT,
};
