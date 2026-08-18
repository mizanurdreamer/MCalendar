import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "./Agent_Runner_Engine.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

export async function reviewTests(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  mcalendarPath: string,
  testFilename: string,
  testContent: string,
  context: string
): Promise<string> {
  const provider = getTaskProvider("Agent_Tests_Reviewer", agentConfig);
  logger.task("Agent_Tests_Reviewer", `${getTaskProviderName("Agent_Tests_Reviewer", agentConfig)}/${getTaskModel("Agent_Tests_Reviewer", agentConfig)}`);

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig["Agent_Tests_Reviewer"]?.maxTokens,
      temperature: agentConfig["Agent_Tests_Reviewer"]?.temperature,
    },
    SYSTEM_PROMPTS.Agent_Tests_Reviewer,
    `Review and fix this test if needed:\n\nFilename: ${testFilename}\n\nTest file:\n\`\`\`typescript\n${testContent}\n\`\`\`\n\nContext:\n${context}`
  );

  logger.success("Review complete");
  return result;
}
