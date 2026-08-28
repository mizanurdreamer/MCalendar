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

export async function initMcpClient(browser = "chromium"): Promise<void> {
  refCount++;
  if (client) return;

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
}

export async function callMcpTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  if (!client) {
    return "MCP client not initialized. Call initMcpClient() first.";
  }

  try {
    const result = await client.callTool(name, args);
    const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    return content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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

export async function shutdownMcpClient(): Promise<void> {
  refCount--;
  if (refCount <= 0 && client) {
    await client.close();
    client = null;
    transport = null;
    cachedTools = [];
    refCount = 0;
    logger.info("Playwright MCP server shut down");
  }
}
