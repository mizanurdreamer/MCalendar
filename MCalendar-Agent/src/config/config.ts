import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { AgentConfig } from "../providers/types.js";

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4.1",
  google: "gemini-2.5-flash",
  ollama: "llama3.2",
};

const PROVIDER_API_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
};

export interface AppConfig {
  provider: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
  mcalendarPath: string;
  testProjectPath: string;
  pollIntervalMin: number;
  maxRetries: number;
  agentConfig: AgentConfig;
  agentEnabled: boolean;
  watchBranch?: string;
}

export function loadConfig(): AppConfig {
  dotenv.config({ override: true });

  const provider = process.env.PROVIDER;
  if (!provider) throw new Error("Missing required env var: PROVIDER");
  if (!DEFAULT_MODELS[provider]) {
    throw new Error(`Unknown PROVIDER: "${provider}". Available: ${Object.keys(DEFAULT_MODELS).join(", ")}`);
  }

  const envModel = process.env.MODEL;
  const resolvedModel = (envModel && envModel !== "auto") ? envModel : DEFAULT_MODELS[provider];

  const apiKeyEnv = PROVIDER_API_KEY_ENV[provider];
  if (apiKeyEnv && !process.env[apiKeyEnv]) {
    throw new Error(`PROVIDER is "${provider}" but missing env var: ${apiKeyEnv}`);
  }

  const configPath = path.resolve("agent.config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("agent.config.json not found. Run from the MCalendar-Agent directory.");
  }
  const fileConfig: Record<string, { maxTokens?: number; temperature?: number }> = JSON.parse(
    fs.readFileSync(configPath, "utf-8")
  );

  const agentConfig: AgentConfig = {};
  for (const [taskName, settings] of Object.entries(fileConfig)) {
    agentConfig[taskName] = {
      provider,
      model: resolvedModel,
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
    };
  }

  const required = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    REPO_OWNER: process.env.REPO_OWNER,
    REPO_NAME: process.env.REPO_NAME,
    PROJECT_PATH: process.env.PROJECT_PATH,
    TEST_PROJECT_PATH: process.env.TEST_PROJECT_PATH,
  };

  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`Missing required env var: ${key}`);
  }

  return {
    provider,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    githubToken: required.GITHUB_TOKEN!,
    repoOwner: required.REPO_OWNER!,
    repoName: required.REPO_NAME!,
    mcalendarPath: required.PROJECT_PATH!,
    testProjectPath: required.TEST_PROJECT_PATH!,
    pollIntervalMin: parseInt(process.env.POLL_INTERVAL_MIN ?? "1", 10),
    maxRetries: parseInt(process.env.MAX_RETRIES ?? "3", 10),
    agentConfig,
    agentEnabled: (process.env.AGENT_ENABLED ?? "true").toLowerCase() === "true",
    watchBranch: process.env.WATCH_BRANCH,
  };
}
