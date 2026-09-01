import type { AppConfig } from "../src/config/config.js";
import type {
  ChatMessage,
  ContentBlock,
  ToolDefinition,
  ProviderInterface,
} from "../src/providers/types.js";
import { createProvider } from "../src/providers/registry.js";
import { GitHubClient } from "../src/github/client.js";
import { CodebaseReader } from "../src/codebase/reader.js";
import { StateManager } from "../src/watcher/issue_state_tracker.js";
import { CommitStateManager } from "../src/watcher/commit_state_tracker.js";
import { RunManager } from "./run_manager.js";
import { broadcast } from "./ws_hub.js";
import { logger } from "../src/utils/logger.js";

const MAX_TOOL_ITERATIONS = 10;
const MAX_TOOL_RESULT_LENGTH = 12_000;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatAgentDeps {
  config: AppConfig;
  github: GitHubClient;
  runManager: RunManager;
}

function buildTools(deps: ChatAgentDeps): ToolDefinition[] {
  return [
    {
      name: "list_issues",
      description: "List GitHub issues for the repository. Optionally filter by project status (e.g., 'ready', 'in progress', 'done').",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by project status (e.g., 'ready'). Omit to list all open issues.",
          },
        },
      },
    },
    {
      name: "get_issue",
      description: "Fetch full details (title, body, labels) of a specific GitHub issue.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "number", description: "Issue number" },
        },
        required: ["number"],
      },
    },
    {
      name: "process_issue",
      description:
        "Start the full test-generation agent pipeline on a GitHub issue in the background " +
        "(analyzes issue, generates Playwright E2E tests, runs them, fixes failures, opens a PR). " +
        "Returns immediately; a result summary is delivered automatically when it finishes.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "number", description: "Issue number to process" },
        },
        required: ["number"],
      },
    },
    {
      name: "process_commit",
      description:
        "Start the commit-analysis agent pipeline on a commit SHA in the background " +
        "(decides if tests are needed from the diff, generates and runs them if so). " +
        "Returns immediately; a result summary is delivered automatically when it finishes.",
      inputSchema: {
        type: "object",
        properties: {
          sha: { type: "string", description: "Commit SHA" },
          branch: { type: "string", description: "Target branch to merge into. Optional." },
        },
        required: ["sha"],
      },
    },
    {
      name: "check_job_status",
      description: "Check whether an agent job is currently running and see recent job history.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_retries",
      description: "List pending retry-queue entries (failed issues/commits awaiting reprocessing).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "clear_retries",
      description: "Clear all pending retries from the retry queue.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "read_codebase_file",
      description: `Read a file from the target project at ${deps.config.codebasePath}. Use paths relative to the project root.`,
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path (e.g. 'src/services/AuthService.ts')" },
        },
        required: ["path"],
      },
    },
    {
      name: "list_codebase_directory",
      description: `List the contents of a directory in the target project at ${deps.config.codebasePath}.`,
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative directory path (e.g. 'src/services')" },
        },
        required: ["path"],
      },
    },
  ];
}

function buildSystemPrompt(deps: ChatAgentDeps): string {
  const { config } = deps;
  const taskNames = Object.keys(config.agentConfig);
  return `You are the MCalendar Test Agent assistant — a friendly operator console for an automated multi-AI testing system.

## What you control
You manage automated E2E test generation for the GitHub repo \`${config.repoOwner}/${config.repoName}\` (project: ${config.projectName}).
- Target app codebase: ${config.codebasePath}
- Test project (Playwright): ${config.testProjectPath}

## How jobs work
- \`process_issue\` / \`process_commit\` start the real agent pipeline (analyzer → test generator → reviewer → runner → reporter) **in the background**. The tool returns immediately — do NOT say the job is done.
- Only ONE job can run at a time. If one is running, tell the user and offer \`check_job_status\`.
- When you start a job: confirm it started, mention it can take several minutes, and that a result summary will appear automatically when finished. Then feel free to help with anything else while it runs.
- Job completion summaries are delivered to the user's chat automatically by the system — you don't need to poll or report them yourself unless asked via \`check_job_status\`.

## Issues and Status
- The \`list_issues\` tool accepts an optional \`status\` parameter to filter by project status.
- When the user asks for issues with a specific status (e.g., "ready", "in progress", "done"), use \`list_issues\` with the \`status\` parameter.
- Example: "get issues with status ready" → call \`list_issues\` with \`status="ready"\`
- The status matching is case-insensitive.

## Rules
- Answer general questions about the project directly using your knowledge plus the codebase tools.
- When asked to do something ("run issue 12", "retry that commit"), pick the right tool and DO it without asking for confirmation.
- Format responses in clean markdown. Keep summaries concise.
- Available pipeline agents in this deployment: ${taskNames.join(", ")}. Provider: ${config.provider}.
- If a tool returns an error, explain it simply and suggest next steps.`;
}

async function executeTool(name: string, input: Record<string, unknown>, deps: ChatAgentDeps): Promise<string> {
  const { config, github, runManager } = deps;
  switch (name) {
    case "list_issues": {
      const status = input.status as string | undefined;
      logger.info(`[ChatAgent] list_issues called with status="${status ?? "all"}"`);
      const issues = status
        ? await github.listIssuesByProjectStatus(status)
        : await github.listOpenIssues();
      if (issues.length === 0) return status ? `No issues with status "${status}".` : "No open issues.";
      const header = status ? `Issues with status "${status}" (${issues.length}):` : `Open issues (${issues.length}):`;
      return header + "\n" + issues
        .map((i: GitHubIssueShape) => `#${i.number} — ${i.title}${i.labels.length ? ` [${i.labels.map((l) => l.name).join(", ")}]` : ""}`)
        .join("\n");
    }
    case "get_issue": {
      const issue = await github.getIssue(Number(input.number));
      return `#${issue.number} — ${issue.title}\nState: ${issue.state}\nLabels: ${issue.labels.map((l) => l.name).join(", ") || "none"}\nCreated: ${issue.created_at}\n\n${issue.body ?? "(no body)"}`;
    }
    case "process_issue": {
      const number = Number(input.number);
      return startJobInBackground(deps, `Issue #${number}`, async () => {
        await deps.runManager.runIssue(number, { source: "chat" });
      });
    }
    case "process_commit": {
      const sha = String(input.sha);
      const branch = input.branch as string | undefined;
      return startJobInBackground(deps, `Commit ${sha.slice(0, 7)}`, async () => {
        await deps.runManager.runCommit(sha, branch, { source: "chat" });
      });
    }
    case "check_job_status": {
      const status = runManager.getStatus();
      if (!status.busy && status.history.length === 0) return "No jobs have been started yet. Agent idle.";
      const lines: string[] = [];
      if (status.current) lines.push(`RUNNING: ${status.current.label} (started ${new Date(status.current.startedAt).toLocaleTimeString()})`);
      else lines.push("No job currently running.");
      for (const h of status.history.slice(0, 5)) {
        lines.push(`  [${h.status}] ${h.label}`);
      }
      return lines.join("\n");
    }
    case "list_retries": {
      const issues = new StateManager("state").getDueIssueRetries();
      const commits = new CommitStateManager("state").getDueCommitRetries();
      if (issues.length === 0 && commits.length === 0) return "Retry queue is empty.";
      const lines = issues.map((r) => `issue #${r.number} "${r.title}" attempts=${r.attempts} lastError=${r.lastError}`);
      lines.push(...commits.map((r) => `commit ${r.sha.slice(0, 7)} "${r.message}" attempts=${r.attempts} lastError=${r.lastError}`));
      return lines.join("\n");
    }
    case "clear_retries": {
      const cleared =
        new StateManager("state").clearIssueRetries() +
        new CommitStateManager("state").clearCommitRetries();
      return `Cleared ${cleared} retry entr${cleared === 1 ? "y" : "ies"}.`;
    }
    case "read_codebase_file": {
      const reader = new CodebaseReader(config.codebasePath);
      const content = reader.readFile(String(input.path));
      return content.length > MAX_TOOL_RESULT_LENGTH
        ? `${content.slice(0, MAX_TOOL_RESULT_LENGTH)}\n…(truncated)`
        : content;
    }
    case "list_codebase_directory": {
      const reader = new CodebaseReader(config.codebasePath);
      return JSON.stringify(reader.listDirectory(String(input.path)), null, 2);
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

interface GitHubIssueShape {
  number: number;
  title: string;
  labels: { name: string }[];
}

function startJobInBackground(
  deps: ChatAgentDeps,
  label: string,
  start: () => Promise<void>
): string {
  void start().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Background job failed to start — ${label}: ${message}`);
    broadcast({
      type: "chat:summary",
      jobId: "none",
      title: label,
      markdown: `❌ **Could not start job:** ${label}\n\n\`${message}\``,
    });
  });
  return `Job started in the background: ${label}. It runs asynchronously and can take several minutes. ` +
    `Tell the user it is running — a result summary will be posted automatically when it finishes. ` +
    `The user can keep chatting meanwhile (e.g. ask about the codebase), and can check progress with check_job_status.`;
}

export async function runChatTurn(
  userMessage: string,
  history: ChatTurn[],
  deps: ChatAgentDeps
): Promise<{ reply: string }> {
  const { config } = deps;

  const provider = resolveChatProvider(config);

  const tools = buildTools(deps);
  const system = buildSystemPrompt(deps);

  const messages: ChatMessage[] = history
    .slice(-20)
    .map((turn): ChatMessage => ({ role: turn.role, content: turn.content }));
  messages.push({ role: "user", content: userMessage });

  let reply = "";

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await provider.chat({
      system,
      messages,
      tools,
      maxTokens: 4096,
      temperature: 0.3,
    });

    messages.push({ role: "assistant", content: response.content });

    const textBlocks = response.content.filter(
      (b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text"
    );
    if (textBlocks.length > 0) reply += textBlocks.map((b) => b.text).join("\n");

    if (response.stopReason !== "tool_use") break;

    const toolResults: ContentBlock[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      broadcast({ type: "chat:activity", phase: "start", name: block.name });
      logger.tool(`chat:${block.name}`, JSON.stringify(block.input).slice(0, 120));
      let resultText: string;
      try {
        resultText = await executeTool(block.name, block.input, deps);
      } catch (err) {
        resultText = `Error executing tool: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (resultText.length > MAX_TOOL_RESULT_LENGTH) {
        resultText = `${resultText.slice(0, MAX_TOOL_RESULT_LENGTH)}\n…(truncated)`;
      }
      broadcast({ type: "chat:activity", phase: "end", name: block.name });
      toolResults.push({ type: "tool_result", toolUseId: block.id, content: resultText });
    }

    if (toolResults.length === 0) break;
    messages.push({ role: "user", content: toolResults });
  }

  return { reply: reply || "(the agent returned no text)" };
}

function resolveChatProvider(config: AppConfig): ProviderInterface {
  const apiKeyEnv = `${config.provider.toUpperCase()}_API_KEY`;
  const apiKey = process.env[apiKeyEnv] ?? "";
  const model = Object.values(config.agentConfig)[0]?.model ?? "auto";
  return createProvider(config.provider, apiKey, model);
}
