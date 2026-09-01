import { GoogleGenAI } from "@google/genai";
import type {
  ProviderInterface,
  ChatParams,
  ChatResponse,
  ContentBlock,
  ToolDefinition,
} from "./types.js";
import { logger } from "../utils/logger.js";

const FALLBACK_MODEL = "gemini-2.5-flash";

export class GoogleProvider implements ProviderInterface {
  name = "google";
  private client: GoogleGenAI;
  private defaultModel: string;
  private resolvedAutoModel?: string;

  constructor(apiKey: string, model = FALLBACK_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
    this.defaultModel = model;
  }

  private async resolveAutoModel(): Promise<string> {
    if (this.resolvedAutoModel) return this.resolvedAutoModel;
    try {
      const models = await this.client.models.list();
      for await (const m of models) {
        if (m.name) {
          const id = m.name.replace(/^models\//, "");
          this.resolvedAutoModel = id;
          logger.info(`[google] MODEL=auto → "${id}" (first model from API)`);
          return id;
        }
      }
      logger.warn(`[google] MODEL=auto → no models returned by API, falling back to "${FALLBACK_MODEL}"`);
    } catch (err) {
      logger.warn(`[google] MODEL=auto discovery failed, falling back to "${FALLBACK_MODEL}": ${err instanceof Error ? err.message : String(err)}`);
    }
    this.resolvedAutoModel = FALLBACK_MODEL;
    return this.resolvedAutoModel;
  }

  async chat({
    system,
    messages,
    tools,
    maxTokens = 4096,
    temperature = 0.3,
    promptCaching = false,
  }: ChatParams): Promise<ChatResponse> {
    const effectiveModel =
      this.defaultModel === "auto"
        ? await this.resolveAutoModel()
        : this.defaultModel;
    const functionDeclarations = tools?.map(this.convertTool);

    // Google Context Caching requires explicit cache creation API (not automatic)
    // See: https://ai.google.dev/gemini-api/docs/context-caching
    if (promptCaching) {
      logger.debug("[google] Context caching requires explicit cache creation - not automatically enabled");
    }

    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            typeof m.content === "string"
              ? m.content
              : m.content
                  .filter((b) => b.type === "text")
                  .map((b) => ("text" in b ? b.text : ""))
                  .join(""),
        },
      ],
    }));

    const response = await this.client.models.generateContent(
      effectiveModel,
      contents,
      {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
        temperature,
        tools: functionDeclarations
          ? [{ functionDeclarations }]
          : undefined,
        toolConfig: functionDeclarations
          ? {
              functionCallingConfig: {
                mode: "AUTO",
              },
            }
          : undefined,
      }
    );

    const text = response.text ?? "";
    const toolCalls = response.functionCalls?.map((fc: { name: string; args: Record<string, unknown> }) => ({
      name: fc.name,
      arguments: fc.args,
    }));

    const contentBlocks: ContentBlock[] = [{ type: "text", text }];
    if (toolCalls && toolCalls.length > 0) {
      toolCalls.forEach((tc: { name: string; arguments: Record<string, unknown> }) => {
        contentBlocks.push({ type: "tool_use", id: tc.name, name: tc.name, input: tc.arguments });
      });
    }

    return {
      content: contentBlocks,
      stopReason: toolCalls && toolCalls.length > 0 ? "tool_use" : "end_turn",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  private convertTool(tool: ToolDefinition): any {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    };
  }
}