import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "../providers/types.js";

export function getDevToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "lint_code",
      description: "Run linter on code and return errors/warnings.",
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string", description: "Specific file to lint (optional, lints all if empty)" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
      },
    },
    {
      name: "check_types",
      description: "Run TypeScript type checking. Returns type errors.",
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string", description: "Working directory (optional)" },
        },
      },
    },
    {
      name: "test_coverage",
      description: "Run tests with coverage report.",
      inputSchema: {
        type: "object",
        properties: {
          file: { type: "string", description: "Specific test file (optional)" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
      },
    },
    {
      name: "screenshot",
      description: "Take a screenshot of a URL using Playwright. Returns file path.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to screenshot" },
          filename: { type: "string", description: "Output filename (optional)" },
        },
        required: ["url"],
      },
    },
    {
      name: "check_deps",
      description: "Check package.json for outdated or missing dependencies.",
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string", description: "Working directory (optional)" },
        },
      },
    },
    {
      name: "install_deps",
      description: "Install npm dependencies.",
      inputSchema: {
        type: "object",
        properties: {
          package: { type: "string", description: "Specific package to install (optional, installs all if empty)" },
          cwd: { type: "string", description: "Working directory (optional)" },
          dev: { type: "boolean", description: "Install as dev dependency (optional)" },
        },
      },
    },
    {
      name: "stack_trace",
      description: "Parse and analyze a stack trace. Returns file locations and error summary.",
      inputSchema: {
        type: "object",
        properties: {
          trace: { type: "string", description: "Stack trace string to analyze" },
        },
        required: ["trace"],
      },
    },
    {
      name: "compare_files",
      description: "Compare two files and show differences.",
      inputSchema: {
        type: "object",
        properties: {
          file1: { type: "string", description: "First file path (relative)" },
          file2: { type: "string", description: "Second file path (relative)" },
        },
        required: ["file1", "file2"],
      },
    },
    {
      name: "find_usage",
      description: "Find where a function/variable is used in the codebase.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Function or variable name to search for" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["name"],
      },
    },
    {
      name: "find_definition",
      description: "Find where a function/variable is defined in the codebase.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Function or variable name to find" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["name"],
      },
    },
  ];
}

export async function executeDevTool(
  name: string,
  input: Record<string, unknown>,
  projectPath: string
): Promise<string> {
  const cwd = (input.cwd as string) || projectPath;

  switch (name) {
    case "lint_code": {
      const file = input.file as string | undefined;
      try {
        const target = file || ".";
        const output = execSync(`npx eslint ${target} 2>&1 || true`, { cwd, encoding: "utf-8", timeout: 60_000 });
        return output || "(no lint errors)";
      } catch (err) {
        return `Lint error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "check_types": {
      try {
        const output = execSync("npx tsc --noEmit 2>&1 || true", { cwd, encoding: "utf-8", timeout: 120_000 });
        return output || "(no type errors)";
      } catch (err) {
        return `Type check error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "test_coverage": {
      const file = input.file as string | undefined;
      try {
        const target = file || "";
        const output = execSync(`npx jest --coverage ${target} 2>&1 || npx vitest run --coverage ${target} 2>&1 || true`, { cwd, encoding: "utf-8", timeout: 120_000 });
        return output.slice(0, 10000) || "(no coverage output)";
      } catch (err) {
        return `Coverage error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "screenshot": {
      const url = input.url as string;
      const filename = (input.filename as string) || `screenshot-${Date.now()}.png`;
      const outputPath = path.join(projectPath, filename);
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return "Screenshot error: URL must start with http:// or https://";
      }
      try {
        const { chromium } = require('playwright');
        const browser = await chromium.launch();
        const page = await browser.newPage();
        await page.goto(url);
        await page.screenshot({ path: outputPath, fullPage: true });
        await browser.close();
        return `Screenshot saved: ${filename}`;
      } catch (err) {
        return `Screenshot error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "check_deps": {
      try {
        const pkgPath = path.join(cwd, "package.json");
        if (!fs.existsSync(pkgPath)) return "No package.json found";
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        const output = execSync("npm outdated 2>&1 || true", { cwd, encoding: "utf-8", timeout: 30_000 });
        return `Dependencies (${Object.keys(allDeps).length} total):\n${output || "(all up to date)"}`;
      } catch (err) {
        return `Dep check error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "install_deps": {
      const pkg = input.package as string | undefined;
      const dev = input.dev as boolean;
      try {
        const cmd = pkg
          ? `npm install ${dev ? "--save-dev " : ""}${pkg}`
          : "npm install";
        const output = execSync(cmd, { cwd, encoding: "utf-8", timeout: 120_000 });
        return output || "(installed)";
      } catch (err) {
        return `Install error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "stack_trace": {
      const trace = input.trace as string;
      const lines = trace.split("\n");
      const locations: string[] = [];
      for (const line of lines) {
        const match = line.match(/at\s+(.+?)(?:\s+\((.+?):(\d+):(\d+)\))?/);
        if (match) {
          const fn = match[1];
          const file = match[2];
          const lineNum = match[3];
          if (file) {
            locations.push(`  ${fn} → ${file}:${lineNum}`);
          }
        }
      }
      const errorMsg = lines[0] || "Unknown error";
      return `Error: ${errorMsg}\n\nLocations:\n${locations.join("\n") || "(no locations found)"}`;
    }

    case "compare_files": {
      const file1 = path.join(cwd, input.file1 as string);
      const file2 = path.join(cwd, input.file2 as string);
      if (!fs.existsSync(file1)) return `File not found: ${input.file1}`;
      if (!fs.existsSync(file2)) return `File not found: ${input.file2}`;
      try {
        const output = execSync(`diff "${file1}" "${file2}" || true`, { encoding: "utf-8" });
        return output || "(files are identical)";
      } catch {
        return "(files differ - see diff output)";
      }
    }

    case "find_usage": {
      const name = input.name as string;
      const isWin = process.platform === "win32";
      try {
        const cmd = isWin
          ? `findstr /s /n /c:"${name}" *.ts *.tsx *.js`
          : `grep -rn "${name}" --include="*.ts" --include="*.tsx" --include="*.js" .`;
        const output = execSync(cmd, { cwd, encoding: "utf-8", timeout: 30_000 });
        return output || `(no usages of "${name}" found)`;
      } catch {
        return `(no usages of "${name}" found)`;
      }
    }

    case "find_definition": {
      const name = input.name as string;
      const isWin = process.platform === "win32";
      try {
        const patterns = [
          `function ${name}`,
          `const ${name}`,
          `let ${name}`,
          `var ${name}`,
          `class ${name}`,
          `interface ${name}`,
          `type ${name}`,
          `export.*${name}`,
        ];
        let cmd: string;
        if (isWin) {
          const findstrPatterns = patterns.map((p) => `/c:"${p}"`).join(" ");
          cmd = `findstr /s /n /r ${findstrPatterns} *.ts *.tsx *.js`;
        } else {
          const pattern = patterns.join("\\|");
          cmd = `grep -rn "${pattern}" --include="*.ts" --include="*.tsx" --include="*.js" .`;
        }
        const output = execSync(cmd, { cwd, encoding: "utf-8", timeout: 30_000 });
        return output || `(no definition of "${name}" found)`;
      } catch {
        return `(no definition of "${name}" found)`;
      }
    }

    default:
      return `Unknown dev tool: ${name}`;
  }
}
