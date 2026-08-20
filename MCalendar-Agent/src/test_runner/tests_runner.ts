import type { PlaywrightRunner, TestResult } from "./playwright.js";
import { logger } from "../utils/logger.js";

export async function runTests(
  runner: PlaywrightRunner,
  testFilename: string
): Promise<TestResult> {
  logger.task("Tests_Runner", `running ${testFilename}`);

  const result = runner.run(testFilename);

  if (result.success) {
    logger.success(`${result.passed}/${result.total} tests passed`);
  } else {
    logger.error(`${result.passed}/${result.total} tests failed`);
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        logger.error(`Tests_Runner error: ${err.slice(0, 500)}`);
      }
    }
    logger.debug(`Full output: ${result.output.slice(0, 500)}`);
  }

  return result;
}
