import type { ProviderInterface, ChatMessage, ContentBlock } from "../providers/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import { createAgentTools, executeTool } from "../utils/tools.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { logger } from "../utils/logger.js";
import { initMcpClient, shutdownMcpClient } from "../mcp/client.js";
import { AGENT_NAMES } from "../utils/agent_names.js";

export interface TaskContext {
  provider: ProviderInterface;
  reader: CodebaseReader;
  runner: PlaywrightRunner;
  testOutputPath: string;
  codebasePath: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
}

const PROVIDER_RETRY_DELAYS_MS = [2000, 4000, 8000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAgentLoop(
  ctx: TaskContext,
  systemPrompt: string,
  userMessage: string,
  maxIterations = 20,
  agentName = "unknown"
): Promise<string> {
  const mcpEnabled = (process.env.MCP_ENABLED ?? "true").toLowerCase() === "true";
  if (mcpEnabled) {
    try {
      await initMcpClient(process.env.MCP_BROWSER ?? "chromium");
    } catch (err) {
      logger.warn(`MCP init failed (continuing without browser tools): ${err}`);
    }
  }
  
  // if(agentName === AGENT_NAMES.ISSUE_ANALYZER || agentName === AGENT_NAMES.TESTS_GENERATOR ){
  //   logger.info(`bypassing Agent : ${agentName} with maxIterations=${maxIterations} and maxRetries=${ctx.maxRetries ?? 3}`);
  //   return `[${agentName} Agent bypassed for this task]`;
  // }
  
  const tools = createAgentTools(ctx.reader, ctx.runner, ctx.codebasePath);
  const messages: ChatMessage[] = [{ role: "user", content: userMessage }];
  logger.prompt(agentName, systemPrompt, userMessage);

  for (let i = 0; i < maxIterations; i++) {
    let lastError: unknown;
    let response;

    for (let attempt = 0; attempt < (ctx.maxRetries ?? 3); attempt++) {
      try {
        response = await ctx.provider.chat({
          system: systemPrompt,
          messages,
          tools,
          maxTokens: ctx.maxTokens,
          temperature: ctx.temperature,
        });
        break;
      } catch (err) {
        lastError = err;
        logger.warn(`Provider call failed (attempt ${attempt + 1}/${ctx.maxRetries ?? 3}): ${err instanceof Error ? err.message : String(err)}`);
        if (attempt < (ctx.maxRetries ?? 3) - 1) {
          await sleep(PROVIDER_RETRY_DELAYS_MS[attempt]);
        }
      }
    }

    if (!response) {
      return `[Provider failed after ${ctx.maxRetries ?? 3} retries: ${lastError instanceof Error ? lastError.message : String(lastError)}]`;
    }

    const textBlocks = response.content.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text");
    const toolBlocks = response.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");

    for (const block of textBlocks) {
      if (block.text) logger.tool("response", block.text.slice(0, 100) + "...");
    }

    if (response.stopReason === "end_turn" || toolBlocks.length === 0) {
      const result = textBlocks.map((b) => b.text).join("\n");
      logger.prompt(agentName, systemPrompt, userMessage, result);
      if (mcpEnabled) await shutdownMcpClient().catch(() => {});
      return result;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: ContentBlock[] = [];
    for (const block of toolBlocks) {
      logger.tool(block.name, JSON.stringify(block.input).slice(0, 80));
      const result = await executeTool(
        block.name,
        block.input,
        ctx.reader,
        ctx.runner,
        ctx.testOutputPath,
        ctx.codebasePath
      );
      toolResults.push({
        type: "tool_result",
        toolUseId: block.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  if (mcpEnabled) await shutdownMcpClient().catch(() => {});
  const fallback = "[Agent reached max iterations]";
  logger.prompt(agentName, systemPrompt, userMessage, fallback);
  return fallback;
}
