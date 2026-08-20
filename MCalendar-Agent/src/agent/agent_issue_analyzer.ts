import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "../engine/agent_runner_engine.js";
import type { SharedContext } from "../engine/shared_context.js";
import { buildPrompt } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

export async function analyzeIssue(
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
  const provider = getTaskProvider("agent_issue_analyzer", agentConfig);
  logger.task("agent_issue_analyzer", `${getTaskProviderName("agent_issue_analyzer", agentConfig)}/${getTaskModel("agent_issue_analyzer", agentConfig)}`);

  const systemPrompt = buildPrompt({
    agentType: "issue_analyzer",
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
      maxTokens: agentConfig["agent_issue_analyzer"]?.maxTokens,
      temperature: agentConfig["agent_issue_analyzer"]?.temperature,
      maxRetries: context?.maxRetries,
    },
    systemPrompt,
    userMessage,
    maxIterations,
    "agent_issue_analyzer"
  );

  logger.success("Issue analysis complete");
  return result;
}
