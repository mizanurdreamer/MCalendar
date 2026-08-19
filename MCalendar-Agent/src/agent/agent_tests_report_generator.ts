import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import type { TestResult } from "../test_runner/playwright.js";
import { runAgentLoop } from "../engine/agent_runner_engine.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import { logger } from "../utils/logger.js";

export async function generateTestReport(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  mcalendarPath: string,
  testResult: TestResult
): Promise<string> {
  const provider = getTaskProvider("agent_tests_report_generator", agentConfig);
  logger.task("agent_tests_report_generator", `${getTaskProviderName("agent_tests_report_generator", agentConfig)}/${getTaskModel("agent_tests_report_generator", agentConfig)}`);

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig["agent_tests_report_generator"]?.maxTokens,
      temperature: agentConfig["agent_tests_report_generator"]?.temperature,
    },
    SYSTEM_PROMPTS.agent_tests_report_generator,
    `Format these Playwright test results into a structured report:\n\nTotal: ${testResult.total}\nPassed: ${testResult.passed}\nFailed: ${testResult.failed}\nStatus: ${testResult.success ? "All passed" : "Some failed"}\n\nErrors:\n${testResult.errors.join("\n\n")}`
  );

  logger.success("Report generated");
  return result;
}
