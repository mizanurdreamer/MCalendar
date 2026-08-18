import type { PlaywrightRunner, TestResult } from "../test_runner/playwright.js";
import { logger } from "../utils/logger.js";

export async function runTests(
  runner: PlaywrightRunner,
  testFilename: string
): Promise<TestResult> {
  logger.task("Tests_Runner", `running ${testFilename}`);

  const result = runner.run(testFilename);

  logger[result.success ? "success" : "error"](
    `${result.passed}/${result.total} tests ${result.success ? "passed" : "failed"}`
  );

  return result;
}
