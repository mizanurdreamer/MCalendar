import OpenAI from "openai";
import type {
  ProviderInterface,
  ChatParams,
  ChatResponse,
  ContentBlock,
  ToolDefinition,
} from "./types.js";
import { logger } from "../utils/logger.js";

const FALLBACK_MODEL = "llama3.2";

export class OllamaProvider implements ProviderInterface {
  name = "ollama";
  private client: OpenAI;
  private apiBaseURL: string;
  private defaultModel: string;
  private resolvedAutoModel?: string;

  constructor(baseURL = "http://localhost:11434/v1", model = FALLBACK_MODEL) {
    this.client = new OpenAI({ baseURL, apiKey: "ollama" });
    this.apiBaseURL = baseURL.replace(/\/v1\/?$/, "");
    this.defaultModel = model;
  }

  private async resolveAutoModel(): Promise<string> {
    if (this.resolvedAutoModel) return this.resolvedAutoModel;
    try {
      const res = await fetch(`${this.apiBaseURL}/api/tags`);
      if (res.ok) {
        const data = (await res.json()) as { models?: { name?: string }[] };
        const first = data.models?.[0]?.name;
        if (first) {
          this.resolvedAutoModel = first;
          logger.info(`[ollama] MODEL=auto → "${first}" (first model from API)`);
          return first;
        }
      }
      logger.warn(`[ollama] MODEL=auto → no models returned by API, falling back to "${FALLBACK_MODEL}"`);
    } catch (err) {
      logger.warn(`[ollama] MODEL=auto discovery failed, falling back to "${FALLBACK_MODEL}": ${err instanceof Error ? err.message : String(err)}`);
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
    const openaiTools = tools?.map(this.convertTool);

    const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          typeof m.content === "string"
            ? m.content
            : m.content
                .filter((b) => b.type === "text")
                .map((b) => ("text" in b ? b.text : ""))
                .join(""),
      })),
    ];

    const response = await this.client.chat.completions.create({
      model: effectiveModel,
      messages: apiMessages,
      tools: openaiTools,
      max_tokens: maxTokens,
      temperature,
    });

    const choice = response.choices[0];
    const contentBlocks: ContentBlock[] = [];

    if (choice.message.content) {
      contentBlocks.push({ type: "text", text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        contentBlocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      content: contentBlocks,
      stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  private convertTool(tool: ToolDefinition): OpenAI.ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    };
  }
}
