import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "../engine/agent_runner_engine.js";
import { buildPrompt } from "../prompts/index.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";

export async function generateTestReport(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  codebasePath: string,
  testResult: { total: number; passed: number; failed: number; success: boolean; errors: string[] },
  projectName: string,
  maxIterations?: number,
  maxRetries?: number
): Promise<string> {
  const agentName = AGENT_NAMES.TESTS_REPORT_GENERATOR;
  const provider = getTaskProvider(agentName, agentConfig);
  logger.task(agentName, `${getTaskProviderName(agentName, agentConfig)}/${getTaskModel(agentName, agentConfig)}`);

  const systemPrompt = buildPrompt({
    agentType: "report_generator",
    projectName,
  });

  const userMessage = `Generate a test report for the following results:\n\nTotal: ${testResult.total}\nPassed: ${testResult.passed}\nFailed: ${testResult.failed}\nSuccess: ${testResult.success}\n\nErrors:\n${testResult.errors.join("\n") || "(none)"}`;

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      codebasePath,
      maxTokens: agentConfig[agentName]?.maxTokens,
      temperature: agentConfig[agentName]?.temperature,
      maxRetries,
    },
    systemPrompt,
    userMessage,
    maxIterations,
    agentName
  );

  logger.success("Report generated");
  return result;
}
