import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "../providers/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { getDiagnosticToolDefinitions, executeDiagnosticTool, type DiagnosticToolConfig } from "./diagnostic_tools.js";
import { getDatabaseToolDefinitions, executeDatabaseTool } from "./database_tools.js";
import { getDevToolDefinitions, executeDevTool } from "./dev_tools.js";
import { getMcpToolDefinitions } from "../mcp/tools.js";
import { callMcpTool, isMcpTool } from "../mcp/client.js";

export function createAgentTools(
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  codebasePath: string
): ToolDefinition[] {
  const existingTools: ToolDefinition[] = [
    {
      name: "read_file",
      description:
        "Read a file from the project. " +
        "Use relative paths from the project root (e.g., 'src/services/AuthService.ts').",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path from project root",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "list_directory",
      description:
        "List contents of a directory in the project. " +
        "Returns file and folder names.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path from project root (e.g., 'app/api')",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "write_test_file",
      description:
        "Write a generated Playwright test file to the test project's tests/. " +
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
        "Execute Playwright tests in the test project and return the results (pass/fail, errors). " +
        "If no filename is provided, runs all tests in tests/.",
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

  return [
    ...existingTools,
    ...getDiagnosticToolDefinitions(),
    ...getDatabaseToolDefinitions(),
    ...getDevToolDefinitions(),
    ...getMcpToolDefinitions(),
  ];
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  codebasePath: string
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
      return `Test file written to: tests/${filename}`;
    }
    case "run_playwright_test": {
      const filename = input.filename as string | undefined;
      const result = runner.run(filename);
      return JSON.stringify(result, null, 2);
    }
    default: {
      // MCP browser tools
      if (isMcpTool(name)) {
        return callMcpTool(name, input);
      }

      // Check diagnostic tools
      const diagnosticTools = getDiagnosticToolDefinitions();
      if (diagnosticTools.some(t => t.name === name)) {
        return executeDiagnosticTool(name, input, codebasePath);
      }

      // Check database tools
      const databaseTools = getDatabaseToolDefinitions();
      if (databaseTools.some(t => t.name === name)) {
        return executeDatabaseTool(name, input);
      }

      // Check dev tools
      const devTools = getDevToolDefinitions();
      if (devTools.some(t => t.name === name)) {
        return executeDevTool(name, input, codebasePath);
      }

      return `Unknown tool: ${name}`;
    }
  }
}
