import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "../providers/types.js";
import { logger } from "./logger.js";

export interface DiagnosticToolConfig {
  databaseUrl?: string;
  apiBaseUrl?: string;
}

let config: DiagnosticToolConfig = {};

export function setDiagnosticConfig(c: DiagnosticToolConfig) {
  config = c;
}

export function getDiagnosticToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "run_command",
      description: "Execute a shell command and return output. Use for running scripts, checking builds, etc.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["command"],
      },
    },
    {
      name: "query_database",
      description: "Execute a SQL query on PostgreSQL database. Returns query results as JSON.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "SQL query to execute" },
          params: { type: "array", items: { type: "string" }, description: "Query parameters (optional)" },
        },
        required: ["query"],
      },
    },
    {
      name: "call_api",
      description: "Make an HTTP request to an API endpoint. Returns response status and body.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "API endpoint URL (full or relative to API_BASE_URL)" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "HTTP method" },
          body: { type: "string", description: "Request body as JSON string (optional)" },
          headers: { type: "object", description: "Request headers (optional)" },
        },
        required: ["url", "method"],
      },
    },
    {
      name: "read_server_logs",
      description: "Read log files from the logs/ directory. Returns recent log entries.",
      inputSchema: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Log filename (e.g., 'agent-2026-08-19.log'). If empty, lists available logs." },
          lines: { type: "number", description: "Number of recent lines to read (default: 100)" },
        },
      },
    },
    {
      name: "docker_command",
      description: "Execute a docker command. Use for checking containers, logs, etc.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Docker command (e.g., 'ps', 'logs app', 'exec app cat /var/log/app.log')" },
        },
        required: ["command"],
      },
    },
    {
      name: "git_log",
      description: "View recent git commits. Returns commit history.",
      inputSchema: {
        type: "object",
        properties: {
          count: { type: "number", description: "Number of commits to show (default: 10)" },
          branch: { type: "string", description: "Branch name (optional)" },
          file: { type: "string", description: "Show history for specific file (optional)" },
        },
      },
    },
    {
      name: "git_diff",
      description: "Show git diff between commits or branches.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "From commit/branch (default: HEAD~1)" },
          to: { type: "string", description: "To commit/branch (default: HEAD)" },
          file: { type: "string", description: "Diff specific file (optional)" },
        },
      },
    },
    {
      name: "npm_command",
      description: "Run npm scripts or commands. Use for test, build, lint, etc.",
      inputSchema: {
        type: "object",
        properties: {
          script: { type: "string", description: "npm script or command (e.g., 'test', 'build', 'lint')" },
          args: { type: "string", description: "Additional arguments (optional)" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["script"],
      },
    },
    {
      name: "check_process",
      description: "Check if a process is running. Returns process info.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Process name or port number" },
        },
        required: ["name"],
      },
    },
    {
      name: "check_port",
      description: "Check if a port is in use and what process is using it.",
      inputSchema: {
        type: "object",
        properties: {
          port: { type: "number", description: "Port number to check" },
        },
        required: ["port"],
      },
    },
    {
      name: "env_check",
      description: "Read environment variables. Returns configured env vars.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Specific env var name (optional, returns all if empty)" },
        },
      },
    },
    {
      name: "run_migration",
      description: "Run database migrations. Use prisma migrate or similar.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", enum: ["deploy", "status", "reset"], description: "Migration command" },
          cwd: { type: "string", description: "Project directory (optional)" },
        },
        required: ["command"],
      },
    },
  ];
}

export async function executeDiagnosticTool(
  name: string,
  input: Record<string, unknown>,
  projectPath: string
): Promise<string> {
  switch (name) {
    case "run_command": {
      const command = input.command as string;
      const cwd = (input.cwd as string) || projectPath;
      try {
        const output = execSync(command, { cwd, encoding: "utf-8", timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] });
        return output || "(no output)";
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return `Error: ${e.stderr || e.message || String(err)}`;
      }
    }

    case "query_database": {
      if (!config.databaseUrl) return "Error: DATABASE_URL not configured";
      const query = input.query as string;
      const params = (input.params as string[]) || [];
      try {
        const { Client } = await import("pg");
        const client = new Client({ connectionString: config.databaseUrl });
        await client.connect();
        const result = await client.query(query, params);
        await client.end();
        return JSON.stringify({ rows: result.rows, rowCount: result.rowCount }, null, 2);
      } catch (err) {
        return `Database error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "call_api": {
      const url = input.url as string;
      const method = (input.method as string) || "GET";
      const body = input.body ? JSON.parse(input.body as string) : undefined;
      const headers = (input.headers as Record<string, string>) || {};

      const fullUrl = url.startsWith("http") ? url : `${config.apiBaseUrl || "http://localhost:3000"}${url}`;

      try {
        const response = await fetch(fullUrl, {
          method,
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const responseBody = await response.text();
        return JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          body: responseBody.slice(0, 5000),
        }, null, 2);
      } catch (err) {
        return `API error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "read_server_logs": {
      const logsDir = path.join(process.cwd(), "logs");
      if (!fs.existsSync(logsDir)) return "No logs directory found";

      const filename = input.filename as string | undefined;
      if (!filename) {
        const files = fs.readdirSync(logsDir);
        return `Available log files:\n${files.join("\n")}`;
      }

      const logPath = path.join(logsDir, filename);
      if (!fs.existsSync(logPath)) return `Log file not found: ${filename}`;

      const content = fs.readFileSync(logPath, "utf-8");
      const lines = (input.lines as number) || 100;
      const allLines = content.split("\n");
      const recent = allLines.slice(-lines).join("\n");
      return recent || "(empty log)";
    }

    case "docker_command": {
      const command = input.command as string;
      try {
        const output = execSync(`docker ${command}`, { encoding: "utf-8", timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] });
        return output || "(no output)";
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return `Docker error: ${e.stderr || e.message || String(err)}`;
      }
    }

    case "git_log": {
      const count = (input.count as number) || 10;
      const branch = input.branch as string | undefined;
      const file = input.file as string | undefined;
      try {
        let cmd = `git log --oneline -n ${count}`;
        if (branch) cmd += ` ${branch}`;
        if (file) cmd += ` -- ${file}`;
        const output = execSync(cmd, { cwd: projectPath, encoding: "utf-8" });
        return output || "(no commits)";
      } catch (err) {
        return `Git error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "git_diff": {
      const from = (input.from as string) || "HEAD~1";
      const to = (input.to as string) || "HEAD";
      const file = input.file as string | undefined;
      try {
        let cmd = `git diff ${from}..${to}`;
        if (file) cmd += ` -- ${file}`;
        const output = execSync(cmd, { cwd: projectPath, encoding: "utf-8", maxBuffer: 1024 * 1024 });
        return output || "(no changes)";
      } catch (err) {
        return `Git error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "npm_command": {
      const script = input.script as string;
      const args = (input.args as string) || "";
      const cwd = (input.cwd as string) || projectPath;
      try {
        const output = execSync(`npm ${script} ${args}`, { cwd, encoding: "utf-8", timeout: 120_000, stdio: ["pipe", "pipe", "pipe"] });
        return output || "(no output)";
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return `npm error: ${e.stderr || e.message || String(err)}`;
      }
    }

    case "check_process": {
      const name = input.name as string;
      try {
        const cmd = process.platform === "win32"
          ? `tasklist /FI "IMAGENAME eq ${name}.exe" 2>nul`
          : `ps aux | grep ${name}`;
        const output = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        return output.includes(name) ? `Process "${name}" is running` : `Process "${name}" not found`;
      } catch {
        return `Could not check process "${name}"`;
      }
    }

    case "check_port": {
      const port = input.port as number;
      try {
        const output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        return output ? `Port ${port} is in use:\n${output}` : `Port ${port} is available`;
      } catch {
        return `Port ${port} is available`;
      }
    }

    case "env_check": {
      const name = input.name as string | undefined;
      if (name) {
        const value = process.env[name];
        return value ? `${name}=***` : `${name} not set`;
      }
      const sensitivePattern = /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE|AUTH/i;
      const vars = Object.entries(process.env)
        .filter(([k]) => !k.startsWith("npm_"))
        .map(([k, v]) => sensitivePattern.test(k) ? `${k}=***` : `${k}=${v}`)
        .join("\n");
      return vars || "(no env vars)";
    }

    case "run_migration": {
      const command = input.command as string;
      const cwd = (input.cwd as string) || projectPath;
      try {
        let cmd: string;
        switch (command) {
          case "deploy": cmd = "npx prisma migrate deploy"; break;
          case "status": cmd = "npx prisma migrate status"; break;
          case "reset": cmd = "npx prisma migrate reset --force"; break;
          default: return `Unknown migration command: ${command}`;
        }
        const output = execSync(cmd, { cwd, encoding: "utf-8", timeout: 60_000 });
        return output || "(no output)";
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return `Migration error: ${e.stderr || e.message || String(err)}`;
      }
    }

    default:
      return `Unknown diagnostic tool: ${name}`;
  }
}
