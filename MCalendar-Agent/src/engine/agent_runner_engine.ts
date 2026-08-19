import type { ProviderInterface, ChatMessage, ContentBlock } from "../providers/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import { SYSTEM_PROMPTS } from "../prompts/index.js";
import { createAgentTools, executeTool } from "../utils/tools.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { logger } from "../utils/logger.js";

export interface TaskContext {
  provider: ProviderInterface;
  reader: CodebaseReader;
  runner: PlaywrightRunner;
  testOutputPath: string;
  mcalendarPath: string;
  maxTokens?: number;
  temperature?: number;
}

export async function runAgentLoop(
  ctx: TaskContext,
  systemPrompt: string,
  userMessage: string,
  maxIterations = 20
): Promise<string> {
  const tools = createAgentTools(ctx.reader, ctx.runner, ctx.mcalendarPath);
  const messages: ChatMessage[] = [{ role: "user", content: userMessage }];

  for (let i = 0; i < maxIterations; i++) {
    const response = await ctx.provider.chat({
      system: systemPrompt,
      messages,
      tools,
      maxTokens: ctx.maxTokens,
      temperature: ctx.temperature,
    });

    const textBlocks = response.content.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text");
    const toolBlocks = response.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");

    for (const block of textBlocks) {
      if (block.text) logger.tool("response", block.text.slice(0, 100) + "...");
    }

    if (response.stopReason === "end_turn" || toolBlocks.length === 0) {
      return textBlocks.map((b) => b.text).join("\n");
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
        ctx.testOutputPath
      );
      toolResults.push({
        type: "tool_result",
        toolUseId: block.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "[Agent reached max iterations]";
}
