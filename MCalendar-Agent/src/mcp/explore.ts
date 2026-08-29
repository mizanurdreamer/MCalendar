import { callMcpTool, isMcpAlive } from "./client.js";
import { logger } from "../utils/logger.js";

export interface ExploreOptions {
  baseUrl: string;
  paths?: string[];
  maxSnapshotChars?: number;
}

async function isUrlReachable(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const http = await import("node:http");
    return new Promise<boolean>((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

export async function exploreAppWithMcp(options: ExploreOptions): Promise<string> {
  const { baseUrl, paths = [], maxSnapshotChars = 3000 } = options;
  const exploreInfo: string[] = [];

  try {
    const targetUrl = paths.length > 0
      ? `${baseUrl}${paths[0]}`
      : baseUrl;

    logger.info(`[MCP] Exploring live app at ${targetUrl}...`);

    // Pre-check: verify app is reachable before calling MCP browser_navigate
    if (!isMcpAlive()) {
      logger.warn(`[MCP] MCP client not alive — skipping exploration`);
      return "";
    }

    const reachable = await isUrlReachable(targetUrl, 5000);
    if (!reachable) {
      logger.warn(`[MCP] App not reachable at ${targetUrl} — skipping exploration`);
      return "";
    }

    const navResult = await callMcpTool("browser_navigate", { url: targetUrl });
    if (navResult.startsWith("Error:")) {
      logger.warn(`[MCP] Navigation failed — skipping exploration`);
      return "";
    }
    exploreInfo.push(`Navigation: ${navResult.slice(0, 200)}`);

    const screenshotResult = await callMcpTool("browser_screenshot", {});
    exploreInfo.push(`Screenshot: ${screenshotResult.slice(0, 200)}`);

    const snapshotResult = await callMcpTool("browser_snapshot", {});
    exploreInfo.push(`DOM Snapshot: ${snapshotResult.slice(0, maxSnapshotChars)}`);

    for (let i = 1; i < paths.length; i++) {
      const extraUrl = `${baseUrl}${paths[i]}`;
      const extraNav = await callMcpTool("browser_navigate", { url: extraUrl });
      if (!extraNav.startsWith("Error:")) {
        const extraSnap = await callMcpTool("browser_snapshot", {});
        exploreInfo.push(`DOM Snapshot (${paths[i]}): ${extraSnap.slice(0, maxSnapshotChars)}`);
      }
    }

    logger.info(`[MCP] App exploration complete`);
  } catch (err) {
    logger.warn(`[MCP] Exploration failed: ${err}`);
  }

  return exploreInfo.join("\n\n");
}
