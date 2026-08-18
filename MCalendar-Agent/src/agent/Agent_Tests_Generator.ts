import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "./Agent_Runner_Engine.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

export async function generateTests(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  mcalendarPath: string,
  userMessage: string
): Promise<string> {
  const provider = getTaskProvider("Agent_Tests_Generator", agentConfig);
  logger.task("Agent_Tests_Generator", `${getTaskProviderName("Agent_Tests_Generator", agentConfig)}/${getTaskModel("Agent_Tests_Generator", agentConfig)}`);

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig["Agent_Tests_Generator"]?.maxTokens,
      temperature: agentConfig["Agent_Tests_Generator"]?.temperature,
    },
    SYSTEM_PROMPTS.Agent_Tests_Generator,
    userMessage
  );

  logger.success("Tests generated");
  return result;
}
