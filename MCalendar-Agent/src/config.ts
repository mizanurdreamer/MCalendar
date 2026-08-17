import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { AgentConfig } from "./providers/types.js";

export interface AppConfig {
  anthropicApiKey: string;
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

  const configPath = path.resolve("agent.config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("agent.config.json not found. Run from the MCalendar-Agent directory.");
  }
  const agentConfig: AgentConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  const required = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
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
    anthropicApiKey: required.ANTHROPIC_API_KEY!,
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
