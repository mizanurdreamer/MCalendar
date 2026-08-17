import type { ProviderInterface, ProviderConfig, AgentConfig } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";
// import { OpenAIProvider } from "./openai.js";      // UNCOMMENT TO ENABLE
// import { GoogleProvider } from "./google.js";      // UNCOMMENT TO ENABLE
// import { OllamaProvider } from "./ollama.js";      // UNCOMMENT TO ENABLE

const providerInstances = new Map<string, ProviderInterface>();

export function createProvider(name: string, config: ProviderConfig): ProviderInterface {
  const existing = providerInstances.get(name);
  if (existing) return existing;

  let provider: ProviderInterface;

  switch (name) {
    case "anthropic": {
      const apiKey = process.env[config.apiKeyEnv ?? "ANTHROPIC_API_KEY"];
      if (!apiKey) throw new Error(`Missing env var: ${config.apiKeyEnv ?? "ANTHROPIC_API_KEY"}`);
      provider = new AnthropicProvider(apiKey, config.model);
      break;
    }
    // case "openai": {                                         // UNCOMMENT TO ENABLE
    //   const apiKey = process.env[config.apiKeyEnv ?? "OPENAI_API_KEY"];
    //   if (!apiKey) throw new Error(`Missing env var: ${config.apiKeyEnv ?? "OPENAI_API_KEY"}`);
    //   provider = new OpenAIProvider(apiKey, config.model);
    //   break;
    // }
    // case "google": {                                         // UNCOMMENT TO ENABLE
    //   const apiKey = process.env[config.apiKeyEnv ?? "GOOGLE_API_KEY"];
    //   if (!apiKey) throw new Error(`Missing env var: ${config.apiKeyEnv ?? "GOOGLE_API_KEY"}`);
    //   provider = new GoogleProvider(apiKey, config.model);
    //   break;
    // }
    // case "ollama": {                                         // UNCOMMENT TO ENABLE
    //   provider = new OllamaProvider(config.baseURL, config.model);
    //   break;
    // }
    default:
      throw new Error(
        `Unknown provider: "${name}". Available: anthropic. ` +
        `To enable others, uncomment the provider file and registry case.`
      );
  }

  providerInstances.set(name, provider);
  return provider;
}

export function getTaskProvider(taskName: string, agentConfig: AgentConfig): ProviderInterface {
  const taskConfig = agentConfig.tasks[taskName];
  if (!taskConfig) throw new Error(`Unknown task: ${taskName}`);

  const providerConfig = agentConfig.providers[taskConfig.provider];
  if (!providerConfig) throw new Error(`Unknown provider: ${taskConfig.provider}`);

  return createProvider(taskConfig.provider, { ...providerConfig, model: taskConfig.model });
}

export function getTaskModel(taskName: string, agentConfig: AgentConfig): string {
  return agentConfig.tasks[taskName]?.model ?? "unknown";
}

export function getTaskProviderName(taskName: string, agentConfig: AgentConfig): string {
  return agentConfig.tasks[taskName]?.provider ?? "unknown";
}
