import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop, type TaskContext } from "../engine/agent_runner_engine.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

export async function summarizeResults(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  codebasePath: string,
  userMessage: string,
  maxIterations?: number
): Promise<string> {
  const summarizeProvider = getTaskProvider("agent_summarize", agentConfig);
  logger.task("agent_summarize", `${getTaskProviderName("agent_summarize", agentConfig)}/${getTaskModel("agent_summarize", agentConfig)}`);

  return runAgentLoop(
    {
      provider: summarizeProvider,
      reader,
      runner,
      testOutputPath,
      codebasePath,
      maxTokens: agentConfig["agent_summarize"]?.maxTokens,
      temperature: agentConfig["agent_summarize"]?.temperature,
    },
    SYSTEM_PROMPTS.agent_summarize,
    userMessage,
    maxIterations
  );
}
