import type { TestResult } from "../test_runner/playwright.js";
import { logger } from "./logger.js";

export interface RunTestsLoopOptions {
  maxRetries: number;
  testFilename: string;
  runTests: () => Promise<TestResult>;
  reviewTests: (testContent: string, errorContext: string) => Promise<unknown>;
  readTestContent: () => string;
}

export interface RunTestsLoopResult {
  testResult: TestResult;
  retries: number;
}

export async function runTestsLoop(options: RunTestsLoopOptions): Promise<RunTestsLoopResult> {
  const { maxRetries, testFilename, runTests, reviewTests, readTestContent } = options;

  let testResult = await runTests();
  let retries = 0;

  if (!testResult.success && testResult.errors.length > 0) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.task("Tests_Reviewer", `attempt ${attempt}/${maxRetries}`);
      retries++;

      const errorContext = testResult.errors.join("\n\n");
      const testContent = readTestContent();

      await reviewTests(testContent, errorContext);

      testResult = await runTests();
      if (testResult.success) break;
    }
  }

  return { testResult, retries };
}
