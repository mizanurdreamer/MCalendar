import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "../engine/agent_runner_engine.js";
import { getSystemPrompts } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

export async function generateTests(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  codebasePath: string,
  userMessage: string,
  projectName: string,
  maxIterations?: number
): Promise<string> {
  const provider = getTaskProvider("agent_tests_generator", agentConfig);
  logger.task("agent_tests_generator", `${getTaskProviderName("agent_tests_generator", agentConfig)}/${getTaskModel("agent_tests_generator", agentConfig)}`);

  const prompts = getSystemPrompts(projectName);
  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      codebasePath,
      maxTokens: agentConfig["agent_tests_generator"]?.maxTokens,
      temperature: agentConfig["agent_tests_generator"]?.temperature,
    },
    prompts.agent_tests_generator,
    userMessage,
    maxIterations
  );

  logger.success("Tests generated");
  return result;
}
