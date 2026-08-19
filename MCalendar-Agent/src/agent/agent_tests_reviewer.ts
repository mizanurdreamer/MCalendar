import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "../engine/agent_runner_engine.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

export async function reviewTests(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  codebasePath: string,
  testFilename: string,
  testContent: string,
  context: string,
  maxIterations?: number
): Promise<string> {
  const provider = getTaskProvider("agent_tests_reviewer", agentConfig);
  logger.task("agent_tests_reviewer", `${getTaskProviderName("agent_tests_reviewer", agentConfig)}/${getTaskModel("agent_tests_reviewer", agentConfig)}`);

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      codebasePath,
      maxTokens: agentConfig["agent_tests_reviewer"]?.maxTokens,
      temperature: agentConfig["agent_tests_reviewer"]?.temperature,
    },
    SYSTEM_PROMPTS.agent_tests_reviewer,
    `Review and fix this test if needed:\n\nFilename: ${testFilename}\n\nTest file:\n\`\`\`typescript\n${testContent}\n\`\`\`\n\nContext:\n${context}`,
    maxIterations
  );

  logger.success("Review complete");
  return result;
}
