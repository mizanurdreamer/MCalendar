// ═══════════════════════════════════════════════════════════
// GOOGLE GEMINI PROVIDER — UNCOMMENT TO ENABLE
// Requires: npm install @google/genai (already in package.json)
// Env: GOOGLE_API_KEY
// ═══════════════════════════════════════════════════════════
//
// import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";
// import type {
//   ProviderInterface,
//   ChatParams,
//   ChatResponse,
//   ContentBlock,
//   ToolDefinition,
// } from "./types.js";
//
// export class GoogleProvider implements ProviderInterface {
//   name = "google";
//   private client: GoogleGenAI;
//   private defaultModel: string;
//
//   constructor(apiKey: string, model = "gemini-2.5-flash") {
//     this.client = new GoogleGenAI({ apiKey });
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
//     const functionDeclarations = tools?.map(this.convertTool);
//
//     const contents = messages.map((m) => ({
//       role: m.role === "assistant" ? "model" : "user",
//       parts: [
//         {
//           text:
//             typeof m.content === "string"
//               ? m.content
//               : m.content
//                   .filter((b) => b.type === "text")
//                   .map((b) => ("text" in b ? b.text : ""))
//                   .join(""),
//         },
//       ],
//     }));
//
//     const response = await this.client.models.generateContent({
//       model: this.defaultModel,
//       contents,
//       config: {
//         systemInstruction: system,
//         maxOutputTokens: maxTokens,
//         temperature,
//         tools: functionDeclarations
//           ? [{ functionDeclarations }]
//           : undefined,
//         toolConfig: functionDeclarations
//           ? {
//               functionCallingConfig: {
//                 mode: FunctionCallingConfigMode.AUTO,
//               },
//             }
//           : undefined,
//       },
//     });
//
//     const contentBlocks: ContentBlock[] = [];
//     const text = response.text;
//     if (text) contentBlocks.push({ type: "text", text });
//
//     const functionCalls = response.functionCalls;
//     if (functionCalls) {
//       for (const fc of functionCalls) {
//         contentBlocks.push({
//           type: "tool_use",
//           id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2)}`,
//           name: fc.name,
//           input: (fc.args as Record<string, unknown>) ?? {},
//         });
//       }
//     }
//
//     return {
//       content: contentBlocks,
//       stopReason: functionCalls && functionCalls.length > 0 ? "tool_use" : "end_turn",
//       usage: {
//         inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
//         outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
//       },
//     };
//   }
//
//   private convertTool(tool: ToolDefinition) {
//     return {
//       name: tool.name,
//       description: tool.description,
//       parametersJsonSchema: tool.inputSchema,
//     };
//   }
// }
