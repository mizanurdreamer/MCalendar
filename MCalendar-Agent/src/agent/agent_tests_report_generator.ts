import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "../engine/agent_runner_engine.js";
import { buildPrompt } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

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
  const provider = getTaskProvider("agent_tests_report_generator", agentConfig);
  logger.task("agent_tests_report_generator", `${getTaskProviderName("agent_tests_report_generator", agentConfig)}/${getTaskModel("agent_tests_report_generator", agentConfig)}`);

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
      maxTokens: agentConfig["agent_tests_report_generator"]?.maxTokens,
      temperature: agentConfig["agent_tests_report_generator"]?.temperature,
      maxRetries,
    },
    systemPrompt,
    userMessage,
    maxIterations,
    "agent_tests_report_generator"
  );

  logger.success("Report generated");
  return result;
}
