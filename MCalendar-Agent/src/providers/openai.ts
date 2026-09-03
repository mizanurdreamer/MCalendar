import OpenAI from "openai";
import type {
  ProviderInterface,
  ChatParams,
  ChatResponse,
  ContentBlock,
  ToolDefinition,
} from "./types.js";
import { logger } from "../utils/logger.js";

const FALLBACK_MODEL = "gpt-5.4";

export class OpenAIProvider implements ProviderInterface {
  name = "openai";
  private client: OpenAI;
  private defaultModel: string;
  private resolvedAutoModel?: string;

  constructor(apiKey: string, model = FALLBACK_MODEL) {
    this.client = new OpenAI({ apiKey });
    this.defaultModel = model;
  }

  private async resolveAutoModel(): Promise<string> {
    if (this.resolvedAutoModel) return this.resolvedAutoModel;
    try {
      const page = await this.client.models.list();
      const first = page.data[0]?.id;
      if (first) {
        this.resolvedAutoModel = first;
        logger.info(`[openai] MODEL=auto → "${first}" (first model from API)`);
        return first;
      }
      logger.warn(`[openai] MODEL=auto → no models returned by API, falling back to "${FALLBACK_MODEL}"`);
    } catch (err) {
      logger.warn(`[openai] MODEL=auto discovery failed, falling back to "${FALLBACK_MODEL}": ${err instanceof Error ? err.message : String(err)}`);
    }
    this.resolvedAutoModel = FALLBACK_MODEL;
    return this.resolvedAutoModel;
  }

  async chat({
    system,
    messages,
    tools,
    toolChoice,
    maxTokens = 4096,
    temperature = 0.3,
    promptCaching = false,
    signal,
  }: ChatParams): Promise<ChatResponse> {
    const effectiveModel =
      this.defaultModel === "auto"
        ? await this.resolveAutoModel()
        : this.defaultModel;
    const openaiTools = tools?.map(this.convertTool);

    // OpenAI automatically caches repeated prompt prefixes (no API change needed)
    if (promptCaching) {
      logger.debug("[openai] Prompt caching is automatic for repeated prefixes");
    }

    // Convert toolChoice to OpenAI format
    let openaiToolChoice: OpenAI.ChatCompletionToolChoiceOption | undefined;
    if (toolChoice) {
      if (toolChoice.type === "auto") {
        openaiToolChoice = "auto";
      } else if (toolChoice.type === "any") {
        openaiToolChoice = "required";
      } else if (toolChoice.type === "tool") {
        openaiToolChoice = { type: "function", function: { name: toolChoice.name } };
      }
    }

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
      tool_choice: openaiToolChoice,
      max_tokens: maxTokens,
      temperature,
    }, { signal });

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
