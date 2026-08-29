import { callMcpTool } from "./client.js";
import { logger } from "../utils/logger.js";

export interface ExploreOptions {
  baseUrl: string;
  paths?: string[];
  maxSnapshotChars?: number;
}

export async function exploreAppWithMcp(options: ExploreOptions): Promise<string> {
  const { baseUrl, paths = [], maxSnapshotChars = 3000 } = options;
  const exploreInfo: string[] = [];

  try {
    const targetUrl = paths.length > 0
      ? `${baseUrl}${paths[0]}`
      : baseUrl;

    logger.info(`[MCP] Exploring live app at ${targetUrl}...`);

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
