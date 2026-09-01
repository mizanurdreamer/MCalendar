import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { AgentConfig } from "../providers/types.js";
import { resolveProjectPath } from "../utils/repo_resolver.js";

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o",
  google: "gemini-2.5-flash",
  ollama: "llama3.2",
  openrouter: "meta-llama/llama-3.1-8b-instruct:free",
};

const PROVIDER_API_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export interface AppConfig {
  provider: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  githubToken: string;
  repoOwner: string;
  repoName: string;
  codebasePath: string;
  testProjectPath: string;
  projectName: string;
  pollIntervalMin: number;
  maxRetries: number;
  maxIterations: number;
  maxPipelineSteps: number;
  runMaxRetries: number;
  githubMaxRetries: number;
  agentConfig: AgentConfig;
  agentEnabled: boolean;
  commitAutoApprove: boolean;
  enableHumanGates: boolean;
  promptCachingEnabled: boolean;
  githubProjectNumber: number;
  watchBranch?: string;
  databaseUrl?: string;
  agentMemoryDatabaseUrl?: string;
  apiBaseUrl?: string;
  superAdminEmail?: string;
  superAdminPassword?: string;
  playwrightMcpEnabled: boolean;
  playwrightMcpBrowser: string;
  playwrightWorkers: number;
  memoryType: "local" | "postgres";
}

export function loadConfig(): AppConfig {
  dotenv.config({ override: true } as unknown as { path?: string; override?: boolean });

  const provider = process.env.PROVIDER;
  if (!provider) throw new Error("Missing required env var: PROVIDER");
  if (!DEFAULT_MODELS[provider]) {
    throw new Error(`Unknown PROVIDER: "${provider}". Available: ${Object.keys(DEFAULT_MODELS).join(", ")}`);
  }

  const envModel = process.env.MODEL?.trim();
  const resolvedModel = (!envModel || envModel.toLowerCase() === "auto") ? "auto" : envModel;

  const apiKeyEnv = PROVIDER_API_KEY_ENV[provider];
  if (apiKeyEnv && !process.env[apiKeyEnv]) {
    throw new Error(`PROVIDER is "${provider}" but missing env var: ${apiKeyEnv}`);
  }

  const configPath = path.resolve("agent.config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("agent.config.json not found. Run from the MCalendar-Agent directory.");
  }
  const fileConfig: Record<string, { maxTokens?: number; temperature?: number; promptCaching?: boolean }> = JSON.parse(
    fs.readFileSync(configPath, "utf-8")
  );

  const promptCachingEnabled = (process.env.PROMPT_CACHING_ENABLED ?? "true").toLowerCase() === "true";

  const agentConfig: AgentConfig = {};
  for (const [taskName, settings] of Object.entries(fileConfig)) {
    agentConfig[taskName] = {
      provider,
      model: resolvedModel,
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
      promptCaching: settings.promptCaching ?? promptCachingEnabled,
    };
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const projectPath = process.env.PROJECT_PATH;
  const testProjectPath = process.env.TEST_PROJECT_PATH;

  if (!githubToken) throw new Error("Missing required env var: GITHUB_TOKEN");
  if (!projectPath) throw new Error("Missing required env var: PROJECT_PATH");
  if (!testProjectPath) throw new Error("Missing required env var: TEST_PROJECT_PATH");

  const project = resolveProjectPath(projectPath);
  const testProject = resolveProjectPath(testProjectPath);

  // Derive repoOwner/repoName from PROJECT_PATH if URL, otherwise require env vars
  let repoOwner: string;
  let repoName: string;

  if (project.ownerRepo) {
    repoOwner = project.ownerRepo.owner;
    repoName = project.ownerRepo.repo;
  } else {
    repoOwner = process.env.REPO_OWNER ?? "";
    repoName = process.env.REPO_NAME ?? "";
    if (!repoOwner || !repoName) {
      throw new Error("REPO_OWNER and REPO_NAME are required when PROJECT_PATH is a local path");
    }
  }

  return {
    provider,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    githubToken,
    repoOwner,
    repoName,
    codebasePath: project.resolvedPath,
    testProjectPath: testProject.resolvedPath,
    projectName: project.projectName,
    pollIntervalMin: parseInt(process.env.POLL_INTERVAL_MIN ?? "1", 10),
    maxRetries: parseInt(process.env.AGENT_MAX_RETRIES ?? "3", 10),
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS ?? "50", 10),
    maxPipelineSteps: parseInt(process.env.MAX_PIPELINE_STEPS ?? "50", 10),
    runMaxRetries: parseInt(process.env.RUN_MAX_RETRIES ?? "1", 10),
    githubMaxRetries: parseInt(process.env.GITHUB_MAX_RETRIES ?? "3", 10),
    agentConfig,
    agentEnabled: (process.env.AGENT_ENABLED ?? "true").toLowerCase() === "true",
    commitAutoApprove: (process.env.COMMIT_AUTO_APPROVE ?? "true").toLowerCase() === "true",
    enableHumanGates: (process.env.ENABLE_HUMAN_GATES ?? "false").toLowerCase() === "true",
    promptCachingEnabled,
    githubProjectNumber: parseInt(process.env.GITHUB_PROJECT_NUMBER ?? "0", 10),
    watchBranch: process.env.WATCH_BRANCH,
    databaseUrl: process.env.DATABASE_URL,
    agentMemoryDatabaseUrl: process.env.AGENT_MEMORY_DATABASE_URL,
    apiBaseUrl: process.env.API_BASE_URL,
    superAdminEmail: process.env.SUPER_ADMIN_EMAIL,
    superAdminPassword: process.env.SUPER_ADMIN_PASSWORD,
    playwrightMcpEnabled: (process.env.PLAYWRIGHT_MCP_ENABLED ?? "false").toLowerCase() === "true",
    playwrightMcpBrowser: process.env.PLAYWRIGHT_MCP_BROWSER ?? "chromium",
    playwrightWorkers: parseInt(process.env.PLAYWRIGHT_WORKERS ?? "6", 10),
    memoryType: (process.env.MEMORY_TYPE ?? "local") as "local" | "postgres",
  };
}
