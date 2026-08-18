import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import type { TestResult } from "../test_runner/playwright.js";
import { runAgentLoop } from "./Agent_Runner_Engine.js";
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
  const provider = getTaskProvider("Agent_Tests_Report_Generator", agentConfig);
  logger.task("Agent_Tests_Report_Generator", `${getTaskProviderName("Agent_Tests_Report_Generator", agentConfig)}/${getTaskModel("Agent_Tests_Report_Generator", agentConfig)}`);

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      mcalendarPath,
      maxTokens: agentConfig["Agent_Tests_Report_Generator"]?.maxTokens,
      temperature: agentConfig["Agent_Tests_Report_Generator"]?.temperature,
    },
    SYSTEM_PROMPTS.Agent_Tests_Report_Generator,
    `Format these Playwright test results into a structured report:\n\nTotal: ${testResult.total}\nPassed: ${testResult.passed}\nFailed: ${testResult.failed}\nStatus: ${testResult.success ? "All passed" : "Some failed"}\n\nErrors:\n${testResult.errors.join("\n\n")}`
  );

  logger.success("Report generated");
  return result;
}
