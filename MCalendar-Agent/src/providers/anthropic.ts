import Anthropic from "@anthropic-ai/sdk";
import type {
  ProviderInterface,
  ChatParams,
  ChatResponse,
  ContentBlock,
  ToolDefinition,
} from "./types.js";
import { logger } from "../utils/logger.js";

const FALLBACK_MODEL = "claude-sonnet-4-20250514";

export class AnthropicProvider implements ProviderInterface {
  name = "anthropic";
  private client: Anthropic;
  private defaultModel: string;
  private resolvedAutoModel?: string;

  constructor(apiKey: string, model = FALLBACK_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = model;
  }

  private async resolveAutoModel(): Promise<string> {
    if (this.resolvedAutoModel) return this.resolvedAutoModel;
    try {
      const page = await this.client.models.list();
      const first = page.data[0]?.id;
      if (first) {
        this.resolvedAutoModel = first;
        logger.info(`[anthropic] MODEL=auto → "${first}" (first model from API)`);
        return first;
      }
      logger.warn(`[anthropic] MODEL=auto → no models returned by API, falling back to "${FALLBACK_MODEL}"`);
    } catch (err) {
      logger.warn(`[anthropic] MODEL=auto discovery failed, falling back to "${FALLBACK_MODEL}": ${err instanceof Error ? err.message : String(err)}`);
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
    const anthropicTools = tools?.map(this.convertTool);

    // Convert toolChoice to Anthropic format
    let anthropicToolChoice: Anthropic.ToolChoice | undefined;
    if (toolChoice) {
      if (toolChoice.type === "auto") {
        anthropicToolChoice = { type: "auto" };
      } else if (toolChoice.type === "any") {
        anthropicToolChoice = { type: "any" };
      } else if (toolChoice.type === "tool") {
        anthropicToolChoice = { type: "tool", name: toolChoice.name };
      }
    }

    const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === "string"
          ? m.content
          : m.content.map((b) => {
              if (b.type === "text") return { type: "text" as const, text: b.text };
              if (b.type === "tool_use")
                return {
                  type: "tool_use" as const,
                  id: b.id,
                  name: b.name,
                  input: b.input,
                };
              if (b.type === "tool_result")
                return {
                  type: "tool_result" as const,
                  tool_use_id: b.toolUseId,
                  content: b.content,
                };
              return { type: "text" as const, text: "" };
            }),
    }));

    const response = await this.client.messages.create({
      model: effectiveModel,
      max_tokens: maxTokens,
      system,
      tools: anthropicTools,
      tool_choice: anthropicToolChoice,
      temperature,
      messages: apiMessages,
      // Prompt caching: add cache_control at top level for automatic caching
      ...(promptCaching && { cache_control: { type: "ephemeral" } }),
    }, { signal });

    // Log cache usage if available
    if (promptCaching) {
      const cacheCreation = response.usage.cache_creation_input_tokens ?? 0;
      const cacheRead = response.usage.cache_read_input_tokens ?? 0;
      if (cacheCreation > 0 || cacheRead > 0) {
        logger.debug(`[anthropic] Prompt cache: write=${cacheCreation} read=${cacheRead}`);
      }
    }

    const contentBlocks: ContentBlock[] = response.content.map((block) => {
      if (block.type === "text") return { type: "text", text: block.text };
      if (block.type === "tool_use")
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      return { type: "text", text: "" };
    });

    return {
      content: contentBlocks,
      stopReason: response.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }

  private convertTool(tool: ToolDefinition): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool["input_schema"],
    };
  }
}
