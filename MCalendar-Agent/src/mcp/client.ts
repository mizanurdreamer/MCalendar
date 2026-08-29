import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logger } from "../utils/logger.js";

interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;
let transport: StdioClientTransport | null = null;
let cachedTools: McpToolDef[] = [];
let refCount = 0;
let initializing: Promise<void> | null = null;
let lastBrowser = "chromium";
const mcpTimeoutMs = parseInt(process.env.MCP_TIMEOUT_MS ?? "300000", 10);

export async function initMcpClient(browser = "chromium"): Promise<void> {
  if (client) {
    refCount++;
    return;
  }

  // If another caller is already initializing, wait for it
  if (initializing) {
    await initializing;
    if (client) {
      refCount++;
      return;
    }
  }

  lastBrowser = browser;

  const doInit = async (): Promise<void> => {
    logger.info("Starting Playwright MCP server...");

    transport = new StdioClientTransport({
      command: "npx",
      args: ["@playwright/mcp@latest", "--headless", `--browser=${browser}`],
    });

    transport.onerror = (err: Error) => {
      logger.warn(`MCP transport error: ${err.message}`);
    };

    const sdk = await import("@modelcontextprotocol/sdk/client/index.js");
    const ClientCtor = (sdk as any).Client;
    client = new ClientCtor({ name: "mcalendar-agent", version: "1.0.0" });
    await client.connect(transport);
    logger.success("Playwright MCP server connected");

    const { tools } = await client.listTools();
    cachedTools = tools as unknown as McpToolDef[];
    logger.info(`MCP: ${cachedTools.length} browser tools available`);
  };

  initializing = doInit();
  try {
    await initializing;
    refCount++;
  } catch (err) {
    logger.warn(`MCP init failed: ${err}`);
    client = null;
    transport = null;
    cachedTools = [];
    throw err;
  } finally {
    initializing = null;
  }
}

async function destroyMcpClient(): Promise<void> {
  try {
    if (client) {
      await client.close().catch(() => {});
    }
  } catch {
    // ignore close errors
  }
  client = null;
  transport = null;
  cachedTools = [];
}

async function ensureMcpClient(): Promise<boolean> {
  if (client) return true;
  try {
    await initMcpClient(lastBrowser);
    return !!client;
  } catch {
    return false;
  }
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (!(await ensureMcpClient())) {
    return "MCP client not available. Could not start Playwright MCP server.";
  }

  try {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: mcpTimeoutMs });
    const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    return content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("timed out") || msg.includes("-32001");

    if (isTimeout) {
      logger.warn(`MCP tool "${name}" timed out — restarting server and retrying once`);
      await destroyMcpClient();
      if (!(await ensureMcpClient())) {
        return `Error: MCP server restart failed after timeout on "${name}"`;
      }
      try {
        const retryResult = await client.callTool({ name, arguments: args }, undefined, { timeout: mcpTimeoutMs });
        const retryContent = (retryResult as { content?: Array<{ type: string; text?: string }> }).content ?? [];
        return retryContent
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("\n");
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        logger.warn(`MCP tool "${name}" failed after retry: ${retryMsg}`);
        return `Error: ${retryMsg}`;
      }
    }

    logger.warn(`MCP tool "${name}" failed: ${msg}`);
    return `Error: ${msg}`;
  }
}

export function getMcpToolDefs(): McpToolDef[] {
  return cachedTools;
}

export function isMcpTool(name: string): boolean {
  return name.startsWith("browser_") && cachedTools.some((t) => t.name === name);
}

export function isMcpAlive(): boolean {
  return client !== null;
}

export async function shutdownMcpClient(): Promise<void> {
  refCount--;
  if (refCount <= 0 && client) {
    await destroyMcpClient();
    refCount = 0;
    logger.info("Playwright MCP server shut down");
  }
}
