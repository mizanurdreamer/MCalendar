import type { TestResult } from "./playwright.js";

export function formatTestReport(result: TestResult): string {
  const lines: string[] = [];
  lines.push(`### Test Results\n`);
  lines.push(`- **Total:** ${result.total}`);
  lines.push(`- **Passed:** ${result.passed}`);
  lines.push(`- **Failed:** ${result.failed}`);
  lines.push(`- **Status:** ${result.success ? "✅ All passed" : "❌ Some failed"}`);

  if (result.errors.length > 0) {
    lines.push(`\n### Errors\n`);
    for (const err of result.errors) {
      lines.push(`\`\`\`\n${err.slice(0, 500)}\n\`\`\``);
    }
  }

  return lines.join("\n");
}
