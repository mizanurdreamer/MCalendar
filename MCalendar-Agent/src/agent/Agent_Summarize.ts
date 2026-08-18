import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop, type TaskContext } from "./Agent_Runner_Engine.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

export async function summarizeResults(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  mcalendarPath: string,
  userMessage: string
): Promise<string> {
  const summarizeProvider = getTaskProvider("Agent_Summarize", agentConfig);
  logger.task("Agent_Summarize", `${getTaskProviderName("Agent_Summarize", agentConfig)}/${getTaskModel("Agent_Summarize", agentConfig)}`);

  return runAgentLoop(
    {
      provider: summarizeProvider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig["Agent_Summarize"]?.maxTokens,
      temperature: agentConfig["Agent_Summarize"]?.temperature,
    },
    SYSTEM_PROMPTS.Agent_Summarize,
    userMessage
  );
}
