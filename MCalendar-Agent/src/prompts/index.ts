import { AGENT_ANALYZE_ISSUE_PROMPT } from "./analyze_issue_prompt.js";
import { AGENT_ANALYZE_COMMIT_PROMPT } from "./analyze_commit_prompt.js";
import { AGENT_GENERATE_TESTS_PROMPT } from "./generate_tests_prompt.js";
import { AGENT_REVIEW_TESTS_PROMPT } from "./review_tests_prompt.js";
import { AGENT_FIX_TESTS_PROMPT } from "./fix_tests_prompt.js";
import { AGENT_SUMMARIZE_PROMPT } from "./summarize_prompt.js";

export const SYSTEM_PROMPTS: Record<string, string> = {
  Agent_Analyze_Issue: AGENT_ANALYZE_ISSUE_PROMPT,
  Agent_Analyze_Commit: AGENT_ANALYZE_COMMIT_PROMPT,
  Agent_Generate_Tests: AGENT_GENERATE_TESTS_PROMPT,
  Agent_Review_Tests: AGENT_REVIEW_TESTS_PROMPT,
  Agent_Fix_Tests: AGENT_FIX_TESTS_PROMPT,
  Agent_Summarize: AGENT_SUMMARIZE_PROMPT,
};

export {
  AGENT_ANALYZE_ISSUE_PROMPT,
  AGENT_ANALYZE_COMMIT_PROMPT,
  AGENT_GENERATE_TESTS_PROMPT,
  AGENT_REVIEW_TESTS_PROMPT,
  AGENT_FIX_TESTS_PROMPT,
  AGENT_SUMMARIZE_PROMPT,
};
