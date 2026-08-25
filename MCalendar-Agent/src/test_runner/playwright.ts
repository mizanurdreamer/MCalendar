import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../utils/logger.js";

export interface TestResult {
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  output: string;
  errors: string[];
  htmlReportPath?: string;
}

export class PlaywrightRunner {
  private codebasePath: string;

  constructor(codebasePath: string) {
    this.codebasePath = codebasePath;
  }

  run(filename?: string): TestResult {
    const testPath = filename ? `tests/${filename}` : "tests/";
    const cmd = `npx playwright test ${testPath} --reporter=json,html`;

    try {
      const output = execSync(cmd, {
        cwd: this.codebasePath,
        encoding: "utf-8",
        timeout: 300_000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      logger.info(`[playwright] Test completed successfully`);
      return this.parseOutput(output, true);
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const output = error.stdout ?? error.stderr ?? error.message ?? "";
      logger.error(`[playwright] Test failed (exit code non-zero)`);
      if (output) logger.error(`[playwright] Output: ${output.slice(0, 500)}`);
      return this.parseOutput(output, false);
    }
  }

  /**
   * The html reporter writes its report relative to the playwright package
   * discovery root (nearest ancestor with the package installed), which may be
   * above the test project — so scan upward from the test project for a
   * freshly-written playwright-report/index.html.
   */
  private findFreshHtmlReport(maxAgeMs = 15 * 60_000): string | undefined {
    let dir = path.resolve(this.codebasePath);
    const cutoff = Date.now() - maxAgeMs;

    for (let depth = 0; depth < 4; depth++) {
      const candidate = path.join(dir, "playwright-report", "index.html");
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).mtimeMs >= cutoff) {
          return candidate;
        }
      } catch {
        // ignore stat errors and keep scanning
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return undefined;
  }

  private parseOutput(output: string, rawSuccess: boolean): TestResult {
    try {
      const json = JSON.parse(output);
      const suites = json.suites ?? [];
      let passed = 0;
      let failed = 0;
      const errors: string[] = [];

      const walk = (suite: Record<string, unknown>) => {
        const specs = (suite.specs ?? []) as Record<string, unknown>[];
        for (const spec of specs) {
          const tests = (spec.tests ?? []) as Record<string, unknown>[];
          for (const test of tests) {
            const result = (test.results ?? []) as Record<string, unknown>[];
            if (result.length > 0 && (result[0] as Record<string, unknown>).status === "passed") {
              passed++;
            } else {
              failed++;
              const errorObj = (result[0] as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
              if (errorObj?.message) {
                const msg = errorObj.message as string;
                errors.push(msg);
                logger.error(`[playwright] Test error: ${msg.slice(0, 300)}`);
              }
            }
          }
        }
        const innerSuites = (suite.suites ?? []) as Record<string, unknown>[];
        for (const s of innerSuites) walk(s);
      };

      for (const suite of suites) walk(suite);

      logger.info(`[playwright] Parsed: ${passed} passed, ${failed} failed, ${errors.length} errors`);
      return {
        success: failed === 0,
        total: passed + failed,
        passed,
        failed,
        output,
        errors,
        htmlReportPath: this.findFreshHtmlReport(),
      };
    } catch {
      logger.error(`[playwright] JSON parse failed — using raw output as error`);
      return {
        success: rawSuccess,
        total: 0,
        passed: rawSuccess ? 1 : 0,
        failed: rawSuccess ? 0 : 1,
        output,
        errors: rawSuccess ? [] : [output],
        htmlReportPath: this.findFreshHtmlReport(),
      };
    }
  }
}
