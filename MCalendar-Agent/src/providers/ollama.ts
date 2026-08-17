// ═══════════════════════════════════════════════════════════
// OLLAMA (LOCAL MODEL) PROVIDER — UNCOMMENT TO ENABLE
// Uses OpenAI-compatible API at localhost:11434
// No API key required
// ═══════════════════════════════════════════════════════════
//
// import OpenAI from "openai";
// import type {
//   ProviderInterface,
//   ChatParams,
//   ChatResponse,
//   ContentBlock,
//   ToolDefinition,
// } from "./types.js";
//
// export class OllamaProvider implements ProviderInterface {
//   name = "ollama";
//   private client: OpenAI;
//   private defaultModel: string;
//
//   constructor(baseURL = "http://localhost:11434/v1", model = "llama3.2") {
//     this.client = new OpenAI({ baseURL, apiKey: "ollama" });
//     this.defaultModel = model;
//   }
//
//   async chat({
//     system,
//     messages,
//     tools,
//     maxTokens = 4096,
//     temperature = 0.3,
//   }: ChatParams): Promise<ChatResponse> {
//     const openaiTools = tools?.map(this.convertTool);
//
//     const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
//       { role: "system", content: system },
//       ...messages.map((m) => ({
//         role: m.role as "user" | "assistant",
//         content:
//           typeof m.content === "string"
//             ? m.content
//             : m.content
//                 .filter((b) => b.type === "text")
//                 .map((b) => ("text" in b ? b.text : ""))
//                 .join(""),
//       })),
//     ];
//
//     const response = await this.client.chat.completions.create({
//       model: this.defaultModel,
//       messages: apiMessages,
//       tools: openaiTools,
//       max_tokens: maxTokens,
//       temperature,
//     });
//
//     const choice = response.choices[0];
//     const contentBlocks: ContentBlock[] = [];
//
//     if (choice.message.content) {
//       contentBlocks.push({ type: "text", text: choice.message.content });
//     }
//
//     if (choice.message.tool_calls) {
//       for (const tc of choice.message.tool_calls) {
//         contentBlocks.push({
//           type: "tool_use",
//           id: tc.id,
//           name: tc.function.name,
//           input: JSON.parse(tc.function.arguments),
//         });
//       }
//     }
//
//     return {
//       content: contentBlocks,
//       stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
//       usage: {
//         inputTokens: response.usage?.prompt_tokens ?? 0,
//         outputTokens: response.usage?.completion_tokens ?? 0,
//       },
//     };
//   }
//
//   private convertTool(tool: ToolDefinition): OpenAI.ChatCompletionTool {
//     return {
//       type: "function",
//       function: {
//         name: tool.name,
//         description: tool.description,
//         parameters: tool.inputSchema,
//       },
//     };
//   }
// }
