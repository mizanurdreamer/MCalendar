import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { loadConfig } from "../src/config/config.js";
import { GitHubClient } from "../src/github/client.js";
import { StateManager } from "../src/watcher/issue_state_tracker.js";
import { CommitStateManager } from "../src/watcher/commit_state_tracker.js";
import { logger } from "../src/utils/logger.js";
import { RunManager } from "./run_manager.js";
import { APPROVAL_TYPE } from "../src/utils/constants.js";
import { runChatTurn } from "./chat_agent.js";
import { attachWs, broadcast, connectedCount } from "./ws_hub.js";
import { attachLogBroadcast } from "./log_transport.js";
import { getPendingApprovals as getStoredApprovals, resolveApproval as resolveStoredApproval, createApprovalRequest as createStoredApproval } from "../src/core/approval_store.js";
import { createMemoryStore } from "../src/core/memory.js";

export interface ApprovalRequest {
  id: string;
  agent: string;
  type: typeof APPROVAL_TYPE[keyof typeof APPROVAL_TYPE];
  title: string;
  description: string;
  data: any;
  options: { label: string; value: string }[];
  defaultOption?: string;
  createdAt: number;
  resolved?: boolean;
  resolution?: string;
}

// Re-export from shared store
export const createApprovalRequest = createStoredApproval;
export const getPendingApprovals = getStoredApprovals;
export const resolveApproval = resolveStoredApproval;

export interface WebServerOptions {
  port?: number;
  host?: string;
}

const chatRequestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(40)
    .default([]),
});

export async function startWebServer(options: WebServerOptions = {}): Promise<void> {
  const config = loadConfig();

  if (!config.agentEnabled) {
    logger.warn("AGENT_ENABLED=false — jobs will refuse to run. Set AGENT_ENABLED=true in .env to enable processing.");
  }

  const github = new GitHubClient(config.githubToken, config.repoOwner, config.repoName, config.githubMaxRetries);
  const runManager = new RunManager(config);
  const chatDeps = { config, github, runManager };

  attachLogBroadcast();

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // ── REST API ────────────────────────────────────────────
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      repoOwner: config.repoOwner,
      repoName: config.repoName,
      projectName: config.projectName,
      provider: config.provider,
      model: Object.values(config.agentConfig)[0]?.model ?? "unknown",
      agentEnabled: config.agentEnabled,
      codebasePath: config.codebasePath,
      testProjectPath: config.testProjectPath,
      memoryType: config.memoryType,
    });
  });

  app.get("/api/issues", async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const issues = status
        ? await github.listIssuesByProjectStatus(status)
        : await github.listOpenIssues();
      res.json(
        issues.map((i) => ({
          number: i.number,
          title: i.title,
          labels: i.labels.map((l) => ({ name: l.name })),
          url: i.html_url,
        }))
      );
    } catch (err) {
      res.status(502).json({ error: `GitHub API error: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  app.get("/api/job", (_req: Request, res: Response) => {
    res.json(runManager.getStatus());
  });

  app.post("/api/jobs/issue", async (req: Request, res: Response) => {
    const parsed = z.object({ number: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { number: <positive int> }" });
      return;
    }
    try {
      const job = await runManager.runIssue(parsed.data.number);
      res.json(job);
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/jobs/commit", async (req: Request, res: Response) => {
    const parsed = z
      .object({ sha: z.string().min(7), branch: z.string().optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { sha: string, branch?: string }" });
      return;
    }
    try {
      const job = await runManager.runCommit(parsed.data.sha, parsed.data.branch);
      res.json(job);
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/retries", (_req: Request, res: Response) => {
    res.json({
      issues: new StateManager("state").getDueIssueRetries(),
      commits: new CommitStateManager("state").getDueCommitRetries(),
    });
  });

  app.post("/api/retries/clear", (_req: Request, res: Response) => {
    const cleared =
      new StateManager("state").clearIssueRetries() +
      new CommitStateManager("state").clearCommitRetries();
    broadcast({ type: "retries:update" });
    res.json({ cleared });
  });

  app.get("/api/memory/stats", async (_req: Request, res: Response) => {
    try {
      const memoryStore = createMemoryStore(config.memoryType, config.agentMemoryDatabaseUrl || config.databaseUrl);
      await memoryStore.initialize();
      const stats = await memoryStore.getStats();
      res.json({ memoryType: config.memoryType, ...stats });
    } catch (err) {
      res.status(500).json({ error: `Memory store error: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  app.get("/api/approvals", (_req: Request, res: Response) => {
    res.json({ approvals: getPendingApprovals() });
  });

  app.post("/api/approvals/resolve", async (req: Request, res: Response) => {
    const parsed = z.object({
      id: z.string().min(1),
      resolution: z.string().min(1),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { id: string, resolution: string }" });
      return;
    }
    const approval = resolveApproval(parsed.data.id, parsed.data.resolution);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    // Broadcast approval state change
    broadcast({ type: "approval:resolved", approval });
    res.json({ ok: true });
  });

  // ── Branch Commit Endpoints ──────────────────────────────
  app.get("/api/branches/:branch/commits", async (req: Request, res: Response) => {
    try {
      const branch = req.params.branch;
      const limit = parseInt(req.query.limit as string) || 10;
      const commits = await github.listCommitsOnBranch(branch, limit);
      res.json(commits);
    } catch (err) {
      res.status(500).json({ error: `Failed to list commits: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  app.post("/api/jobs/branch-commit", async (req: Request, res: Response) => {
    const parsed = z.object({ branch: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { branch: string }" });
      return;
    }
    try {
      const sha = await github.getLatestCommitSha(parsed.data.branch);
      const job = await runManager.runCommit(sha, parsed.data.branch, { source: "api" });
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/chat", async (req: Request, res: Response) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body must be { message: string, history?: [{role, content}] }" });
      return;
    }
    try {
      const { reply } = await runChatTurn(parsed.data.message, parsed.data.history, chatDeps);
      res.json({ reply });
    } catch (err) {
      logger.error(`Chat error: ${err}`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json({ error: err.message });
  });

  // ── Static UI ───────────────────────────────────────────
  const uiDist = path.resolve(process.cwd(), "ui", "dist");
  if (fs.existsSync(uiDist)) {
    app.use(express.static(uiDist));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(uiDist, "index.html"));
    });
  } else {
    app.get("/", (_req: Request, res: Response) => {
      res
        .status(200)
        .send("<h1>MCalendar Agent UI</h1><p>UI not built yet. Run <code>npm run build:ui</code>.</p>");
    });
  }

  // ── Start ───────────────────────────────────────────────
  const port = options.port ?? parseInt(process.env.WEB_PORT ?? "3002", 10);
  const host = options.host ?? process.env.WEB_HOST ?? "127.0.0.1";

  const server = http.createServer(app as any);
  attachWs(server);

  server.listen(port, host, () => {
    logger.banner([
      "🌐 MCalendar Agent — Web UI",
      `Listening on http://${host}:${port}`,
      `Repo: ${config.repoOwner}/${config.repoName} · Provider: ${config.provider}`,
      `WebSocket clients: ${connectedCount()}`,
    ]);
  });

  const shutdown = () => {
    logger.info("Shutting down web server…");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
