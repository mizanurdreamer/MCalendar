import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";
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
      const pager = await this.client.models.list();
      for await (const m of pager) {
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
  }: ChatParams): Promise<ChatResponse> {
    const effectiveModel =
      this.defaultModel === "auto"
        ? await this.resolveAutoModel()
        : this.defaultModel;
    const functionDeclarations = tools?.map(this.convertTool);

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

    const response = await this.client.models.generateContent({
      model: effectiveModel,
      contents,
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
        temperature,
        tools: functionDeclarations
          ? [{ functionDeclarations }]
          : undefined,
        toolConfig: functionDeclarations
          ? {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            }
          : undefined,
      },
    });

    const contentBlocks: ContentBlock[] = [];
    const text = response.text;
    if (text) contentBlocks.push({ type: "text", text });

    const functionCalls = response.functionCalls;
    if (functionCalls) {
      for (const fc of functionCalls) {
        contentBlocks.push({
          type: "tool_use",
          id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: fc.name ?? "unknown_function",
          input: (fc.args as Record<string, unknown>) ?? {},
        });
      }
    }

    return {
      content: contentBlocks,
      stopReason: functionCalls && functionCalls.length > 0 ? "tool_use" : "end_turn",
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  private convertTool(tool: ToolDefinition) {
    return {
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.inputSchema,
    };
  }
}
