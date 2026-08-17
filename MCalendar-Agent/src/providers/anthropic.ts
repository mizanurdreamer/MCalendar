import Anthropic from "@anthropic-ai/sdk";
import type {
  ProviderInterface,
  ChatParams,
  ChatResponse,
  ContentBlock,
  ToolDefinition,
} from "./types.js";

export class AnthropicProvider implements ProviderInterface {
  name = "anthropic";
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, model = "claude-sonnet-4-20250514") {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = model;
  }

  async chat({
    system,
    messages,
    tools,
    maxTokens = 4096,
    temperature = 0.3,
  }: ChatParams): Promise<ChatResponse> {
    const anthropicTools = tools?.map(this.convertTool);

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
      model: this.defaultModel,
      max_tokens: maxTokens,
      system,
      tools: anthropicTools,
      temperature,
      messages: apiMessages,
    });

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
