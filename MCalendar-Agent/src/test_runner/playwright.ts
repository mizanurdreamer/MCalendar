import { execSync } from "node:child_process";

export interface TestResult {
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  output: string;
  errors: string[];
}

export class PlaywrightRunner {
  private codebasePath: string;

  constructor(codebasePath: string) {
    this.codebasePath = codebasePath;
  }

  run(filename?: string): TestResult {
    const testPath = filename ? `tests/${filename}` : "tests/";
    const cmd = `npx playwright test ${testPath} --reporter=json`;

    try {
      const output = execSync(cmd, {
        cwd: this.codebasePath,
        encoding: "utf-8",
        timeout: 120_000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return this.parseOutput(output, true);
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const output = error.stdout ?? error.stderr ?? error.message ?? "";
      return this.parseOutput(output, false);
    }
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
                if (errorObj?.message) errors.push(errorObj.message as string);
            }
          }
        }
        const innerSuites = (suite.suites ?? []) as Record<string, unknown>[];
        for (const s of innerSuites) walk(s);
      };

      for (const suite of suites) walk(suite);

      return {
        success: failed === 0,
        total: passed + failed,
        passed,
        failed,
        output,
        errors,
      };
    } catch {
      return {
        success: rawSuccess,
        total: 0,
        passed: rawSuccess ? 1 : 0,
        failed: rawSuccess ? 0 : 1,
        output,
        errors: rawSuccess ? [] : [output],
      };
    }
  }
}
