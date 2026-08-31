import type { AppConfig } from "../src/config/config.js";
import { GitHubClient } from "../src/github/client.js";
import { RunManager } from "./run_manager.js";
interface ChatTurn {
    role: "user" | "assistant";
    content: string;
}
export interface ChatAgentDeps {
    config: AppConfig;
    github: GitHubClient;
    runManager: RunManager;
}
export declare function runChatTurn(userMessage: string, history: ChatTurn[], deps: ChatAgentDeps): Promise<{
    reply: string;
}>;
export {};
