import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "../engine/agent_runner_engine.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

export async function analyzeIssue(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  mcalendarPath: string,
  userMessage: string
): Promise<string> {
  const provider = getTaskProvider("agent_issue_analyzer", agentConfig);
  logger.task("agent_issue_analyzer", `${getTaskProviderName("agent_issue_analyzer", agentConfig)}/${getTaskModel("agent_issue_analyzer", agentConfig)}`);

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig["agent_issue_analyzer"]?.maxTokens,
      temperature: agentConfig["agent_issue_analyzer"]?.temperature,
    },
    SYSTEM_PROMPTS.agent_issue_analyzer,
    userMessage
  );

  logger.success("Issue analysis complete");
  return result;
}
