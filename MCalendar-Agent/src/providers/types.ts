export interface ProviderInterface {
  name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
}

export interface ChatParams {
  system: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type Tool = ToolDefinition;

export interface ChatResponse {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use";
  usage: { inputTokens: number; outputTokens: number };
}

export interface ProviderConfig {
  apiKeyEnv?: string;
  baseURL?: string;
  _comment?: string;
}

export interface TaskConfig {
  provider: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentConfig {
  [taskName: string]: TaskConfig;
}
