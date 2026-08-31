import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { ToolDefinition } from "../providers/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { getToolRegistry, type ToolHandlerContext, type ToolMetadata } from "./tool_registry.js";
import { getDiagnosticToolDefinitions, executeDiagnosticTool, type DiagnosticToolConfig } from "../utils/diagnostic_tools.js";
import { getDatabaseToolDefinitions, executeDatabaseTool } from "../utils/database_tools.js";
import { getDevToolDefinitions, executeDevTool } from "../utils/dev_tools.js";
import { getMcpToolDefinitions } from "../mcp/tools.js";
import { callMcpTool, isMcpTool } from "../mcp/client.js";
import { logger } from "../utils/logger.js";

const ALL_ROLES = ["issue_analyzer", "commit_analyzer", "tests_generator", "tests_reviewer", "tests_report_generator", "summarize"] as const;

export function registerAllTools(
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  codebasePath: string,
  testOutputPath: string,
  testProjectPath: string
): void {
  const registry = getToolRegistry();
  const context: ToolHandlerContext = { codebasePath, testOutputPath, testProjectPath };

  // Core tools
  const coreTools: ToolDefinition[] = [
    {
      name: "read_file",
      description: "Read a file from the project. Use relative paths from the project root (e.g., 'src/services/AuthService.ts').",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from project root" },
        },
        required: ["path"],
      },
    },
    {
      name: "list_directory",
      description: "List contents of a directory in the project. Returns file and folder names.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from project root (e.g., 'app/api')" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_test_file",
      description: "Write a generated Playwright test file to the test project's tests/. The filename should end with .spec.ts.",
      inputSchema: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Test filename or path ending in .spec.ts" },
          content: { type: "string", description: "The complete test file content" },
        },
        required: ["filename", "content"],
      },
    },
    {
      name: "append_test_file",
      description: "Append additional test cases to an existing test file.",
      inputSchema: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Test filename or path ending in .spec.ts" },
          content: { type: "string", description: "Additional test code to append" },
        },
        required: ["filename", "content"],
      },
    },
    {
      name: "run_playwright_test",
      description: "Execute Playwright tests in the test project and return the results (pass/fail, errors).",
      inputSchema: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Specific test file to run (optional)" },
        },
      },
    },
  ];

  // Register core tools
  for (const tool of coreTools) {
    const metadata: ToolMetadata = {
      category: "core",
      roles: [...ALL_ROLES],
    };

    let handler: ((input: Record<string, unknown>, ctx: ToolHandlerContext) => Promise<string>) | undefined;
    switch (tool.name) {
      case "read_file":
        handler = async (input: Record<string, unknown>) => reader.readFile(input.path as string);
        break;
      case "list_directory":
        handler = async (input: Record<string, unknown>) => JSON.stringify(reader.listDirectory(input.path as string), null, 2);
        break;
      case "write_test_file":
        handler = async (input: Record<string, unknown>) => {
          const filename = input.filename as string;
          const content = input.content as string;
          const fullPath = path.join(context.testOutputPath, filename);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, content, "utf-8");
          return `Test file written to: tests/${filename}`;
        };
        break;
      case "append_test_file":
        handler = async (input: Record<string, unknown>) => {
          const filename = input.filename as string;
          const content = input.content as string;
          const fullPath = path.join(context.testOutputPath, filename);
          if (!fs.existsSync(fullPath)) {
            return `File not found: tests/${filename}. Use write_test_file first.`;
          }
          const existing = fs.readFileSync(fullPath, "utf-8");
          const lastDescribeClose = existing.lastIndexOf("});");
          if (lastDescribeClose === -1) {
            fs.appendFileSync(fullPath, "\n" + content, "utf-8");
          } else {
            const updated = existing.slice(0, lastDescribeClose) + "\n" + content + "\n" + existing.slice(lastDescribeClose);
            fs.writeFileSync(fullPath, updated, "utf-8");
          }
          return `Appended test cases to: tests/${filename}`;
        };
        break;
      case "run_playwright_test":
        handler = async (input: Record<string, unknown>) => {
          const filename = input.filename as string | undefined;
          const result = runner.run(filename);
          return JSON.stringify(result, null, 2);
        };
        break;
    }

    registry.register(tool, handler!, metadata);
  }

  // Register diagnostic tools
  for (const tool of getDiagnosticToolDefinitions()) {
    const metadata: ToolMetadata = {
      category: "diagnostic",
      roles: [...ALL_ROLES],
    };
    registry.register(
      tool,
      async (input) => executeDiagnosticTool(tool.name, input, codebasePath),
      metadata
    );
  }

  // Register database tools
  for (const tool of getDatabaseToolDefinitions()) {
    const metadata: ToolMetadata = {
      category: "database",
      roles: [...ALL_ROLES],
    };
    registry.register(
      tool,
      async (input) => executeDatabaseTool(tool.name, input),
      metadata
    );
  }

  // Register dev tools
  for (const tool of getDevToolDefinitions()) {
    const metadata: ToolMetadata = {
      category: "dev",
      roles: [...ALL_ROLES],
    };
    registry.register(
      tool,
      async (input) => executeDevTool(tool.name, input, codebasePath),
      metadata
    );
  }

  // Register MCP browser tools
  for (const tool of getMcpToolDefinitions()) {
    const metadata: ToolMetadata = {
      category: "mcp",
      roles: [...ALL_ROLES],
    };
    registry.register(
      tool,
      async (input) => callMcpTool(tool.name, input),
      metadata
    );
  }

  const stats = registry.getStats();
  logger.info(`[ToolRegistry] Registered ${stats.total} tools: ${JSON.stringify(stats.byCategory)}`);
}
