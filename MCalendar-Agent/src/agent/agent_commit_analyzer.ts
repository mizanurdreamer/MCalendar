import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "../engine/agent_runner_engine.js";
import type { SharedContext } from "../engine/shared_context.js";
import { buildPrompt } from "../prompts/index.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";

export async function analyzeCommit(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  codebasePath: string,
  userMessage: string,
  projectName: string,
  maxIterations?: number,
  context?: SharedContext
): Promise<string> {
  const agentName = AGENT_NAMES.COMMIT_ANALYZER;
  const provider = getTaskProvider(agentName, agentConfig);
  logger.task(agentName, `${getTaskProviderName(agentName, agentConfig)}/${getTaskModel(agentName, agentConfig)}`);

  const systemPrompt = buildPrompt({
    agentType: "commit_analyzer",
    projectName,
    context,
  });

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      codebasePath,
      maxTokens: agentConfig[agentName]?.maxTokens,
      temperature: agentConfig[agentName]?.temperature,
      maxRetries: context?.maxRetries,
    },
    systemPrompt,
    userMessage,
    maxIterations,
    agentName
  );

  logger.success("Commit analysis complete");
  return result;
}
