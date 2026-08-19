import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "../providers/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";

export function createAgentTools(
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  _codebasePath: string
): ToolDefinition[] {
  return [
    {
      name: "read_file",
      description:
        "Read a file from the MCalendar project. " +
        "Use relative paths from the MCalendar project root (e.g., 'services/AuthService.ts').",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path from MCalendar project root",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "list_directory",
      description:
        "List contents of a directory in the MCalendar project. " +
        "Returns file and folder names.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path from MCalendar project root (e.g., 'app/api')",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "write_test_file",
      description:
        "Write a generated Playwright test file to MCalendar-Tests/tests/e2e/. " +
        "The filename should end with .spec.ts. You can use subdirectories (e.g., 'auth/login.spec.ts').",
      inputSchema: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Test filename or path ending in .spec.ts (e.g., 'issue-5-login-test.spec.ts' or 'auth/login.spec.ts')",
          },
          content: {
            type: "string",
            description: "The complete test file content",
          },
        },
        required: ["filename", "content"],
      },
    },
    {
      name: "run_playwright_test",
      description:
        "Execute Playwright tests in MCalendar-Tests and return the results (pass/fail, errors). " +
        "If no filename is provided, runs all tests in tests/e2e/.",
      inputSchema: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "Specific test file to run (e.g., 'issue-5-login-test.spec.ts'). Optional.",
          },
        },
      },
    },
  ];
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string
): Promise<string> {
  switch (name) {
    case "read_file": {
      const filePath = input.path as string;
      return reader.readFile(filePath);
    }
    case "list_directory": {
      const dirPath = input.path as string;
      const entries = reader.listDirectory(dirPath);
      return JSON.stringify(entries, null, 2);
    }
    case "write_test_file": {
      const filename = input.filename as string;
      const content = input.content as string;
      const fullPath = path.join(testOutputPath, filename);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");
      return `Test file written to: tests/e2e/${filename}`;
    }
    case "run_playwright_test": {
      const filename = input.filename as string | undefined;
      const result = runner.run(filename);
      return JSON.stringify(result, null, 2);
    }
    default:
      return `Unknown tool: ${name}`;
  }
}
