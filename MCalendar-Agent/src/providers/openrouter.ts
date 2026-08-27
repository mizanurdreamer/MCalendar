import OpenAI from "openai";
import type {
  ProviderInterface,
  ChatParams,
  ChatResponse,
  ContentBlock,
  ToolDefinition,
} from "./types.js";
import { logger } from "../utils/logger.js";

const BASE_URL = "https://openrouter.ai/api/v1";
const FALLBACK_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

interface OpenRouterModelPricing {
  pricing?: { prompt?: string; completion?: string };
}

export class OpenRouterProvider implements ProviderInterface {
  name = "openrouter";
  private client: OpenAI;
  private defaultModel: string;
  private resolvedAutoModel?: string;

  constructor(apiKey: string, model = FALLBACK_MODEL) {
    this.client = new OpenAI({ apiKey, baseURL: BASE_URL });
    this.defaultModel = model;
  }

  private async resolveAutoModel(): Promise<string> {
    if (this.resolvedAutoModel) return this.resolvedAutoModel;
    try {
      const page = await this.client.models.list();
      const freeModels = page.data.filter((m: any) => {
        const { pricing } = m as unknown as OpenRouterModelPricing;
        return pricing?.prompt === "0" && pricing?.completion === "0";
      });
      const pool = freeModels.length > 0 ? freeModels : page.data;
      const first = pool[0]?.id;
      if (first) {
        this.resolvedAutoModel = first;
        logger.info(
          `[openrouter] MODEL=auto → "${first}"` +
            (freeModels.length > 0
              ? ` (first of ${freeModels.length} free models from API)`
              : " (no free models found, first model from API)")
        );
        return first;
      }
      logger.warn(`[openrouter] MODEL=auto → no models returned by API, falling back to "${FALLBACK_MODEL}"`);
    } catch (err) {
      logger.warn(`[openrouter] MODEL=auto discovery failed, falling back to "${FALLBACK_MODEL}": ${err instanceof Error ? err.message : String(err)}`);
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
