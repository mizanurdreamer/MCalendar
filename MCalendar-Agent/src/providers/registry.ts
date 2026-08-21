import type { ProviderInterface, AgentConfig } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { GoogleProvider } from "./google.js";
import { OllamaProvider } from "./ollama.js";

const providerInstances = new Map<string, ProviderInterface>();

export function createProvider(name: string, apiKey: string, model?: string): ProviderInterface {
  const cacheKey = `${name}:${model ?? "default"}`;
  const existing = providerInstances.get(cacheKey);
  if (existing) return existing;

  let provider: ProviderInterface;

  switch (name) {
    case "anthropic":
      provider = new AnthropicProvider(apiKey, model);
      break;
    case "openai":
      provider = new OpenAIProvider(apiKey, model);
      break;
    case "google":
      provider = new GoogleProvider(apiKey, model);
      break;
    case "ollama":
      provider = new OllamaProvider(process.env.OLLAMA_BASE_URL, model);
      break;
    default:
      throw new Error(
        `Unknown provider: "${name}". Available: anthropic, openai, google, ollama.`
      );
  }

  providerInstances.set(cacheKey, provider);
  return provider;
}

export function getTaskProvider(taskName: string, agentConfig: AgentConfig): ProviderInterface {
  const taskConfig = agentConfig[taskName];
  if (!taskConfig) throw new Error(`Unknown task: ${taskName}`);

  const apiKey = process.env[`${taskConfig.provider.toUpperCase()}_API_KEY`] ?? "";
  return createProvider(taskConfig.provider, apiKey, taskConfig.model);
}

export function getTaskModel(taskName: string, agentConfig: AgentConfig): string {
  return agentConfig[taskName]?.model ?? "unknown";
}

export function getTaskProviderName(taskName: string, agentConfig: AgentConfig): string {
  return agentConfig[taskName]?.provider ?? "unknown";
}
