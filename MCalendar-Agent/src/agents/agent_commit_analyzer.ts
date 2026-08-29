import type { AgentState } from "../core/state.js";
import type { ToolDefinition, ChatMessage, ContentBlock } from "../providers/types.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL, MESSAGE_TYPE, AGENT_EVENT, CORE_AGENT_NAMES } from "../utils/constants.js";
import { createAgentTools, executeTool } from "../utils/tools.js";
import { exploreAppWithMcp } from "../mcp/explore.js";

const SUBMIT_COMMIT_ANALYSIS_TOOL: ToolDefinition = {
  name: "submit_commit_analysis",
  description: "Submit the commit analysis with test decision. Use this tool to return your analysis.",
  inputSchema: {
    type: "object",
    properties: {
      needsTests: { type: "boolean", description: "Whether tests are needed for this commit" },
      reason: { type: "string", description: "Explanation of why tests are/aren't needed" },
      scope: { type: "string", description: "Specific area to test (e.g., 'authentication flow', 'API validation') or null" },
    },
    required: ["needsTests", "reason", "scope"],
  },
};

export class AgentCommitAnalyzer extends BaseAgent {
  constructor(state: AgentState, taskContext: import("../core/base_agent.js").TaskContext) {
    super(AGENT_NAMES.AGENT_COMMIT_ANALYZER, state, AgentCommitAnalyzer.buildSystemPrompt(), taskContext);
  }

  static buildSystemPrompt(): string {
    return `You are the Commit Analyzer agent. Your job is to analyze Git commits and determine if tests are needed.

Given a commit diff, you must:
1. Understand what changed and why
2. Explore the live app and codebase to verify the current state
3. Read changed source files to understand the implementation
4. Assess risk level of changes
5. Determine if tests are needed for the changes
6. Define the scope of testing needed

BASELINE CONTEXT:
You will receive pre-explored project structure, changed files, and live app exploration in your first message. This is your baseline understanding. Use it as a starting point.

TOOLS AVAILABLE:
- read_file: Read source files to understand implementation details
- list_directory: List directory contents to explore project structure
- browser_navigate: Navigate to a URL in the live app
- browser_snapshot: Get the DOM structure of the current page
- browser_screenshot: Take a screenshot of the current page
- browser_click: Click an element on the page
- browser_type: Type text into an input field
- browser_console_messages: Get browser console output

WHEN TO USE TOOLS:
If the baseline context is insufficient to understand the commit:
- Read specific changed files in full to understand the implementation
- Navigate to relevant pages to verify the UI state
- Check database schema if changes involve data models

When you have enough information, call submit_commit_analysis with your complete analysis.`;
  }

  getGoal(): string {
    const diff = this.state.commitDiff;
    return `Analyze commit ${diff?.sha.slice(0,7)}: ${diff?.message.split("\n")[0]} and determine test requirements`;
  }

  getDefaultPlan(): import("../core/state.js").AgentPlan {
    return {
      agent: AGENT_NAMES.AGENT_COMMIT_ANALYZER,
      goal: this.getGoal(),
      steps: [
        {
          id: "explore_app",
          tool: "browser_navigate",
          args: {},
          expectedOutcome: "Explore live app to understand current UI state",
          reasoning: "Browser exploration helps verify the commit's impact on the UI",
        },
        {
          id: "read_changed_files",
          tool: "read_file",
          args: {},
          expectedOutcome: "Understand the code changes in context",
          reasoning: "Reading changed files helps assess risk and test scope",
        },
        {
          id: "analyze_commit",
          tool: "submit_commit_analysis",
          args: {},
          expectedOutcome: "Complete commit analysis with test decision",
          reasoning: "Use LLM to analyze the commit diff and determine if tests are needed",
        },
      ],
      estimatedIterations: 2,
      riskLevel: RISK_LEVEL.LOW,
      createdAt: Date.now(),
    };
  }

  protected getAvailableTools(): ToolDefinition[] {
    return createAgentTools(this.taskContext.reader, this.taskContext.runner, this.taskContext.codebasePath);
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    return executeTool(name, input, this.taskContext.reader, this.taskContext.runner, this.taskContext.testOutputPath, this.taskContext.codebasePath);
  }

  private async exploreChangedFiles(files: { filename: string }[]): Promise<string> {
    const projectInfo: string[] = [];
    const reader = this.taskContext.reader;

    try {
      const rootEntries = reader.listDirectory(".");
      projectInfo.push(`Project root: ${rootEntries.join(", ")}`);

      for (const file of files.slice(0, 5)) {
        const content = reader.readFile(file.filename);
        if (content && !content.startsWith("Error")) {
          const preview = content.slice(0, 1500);
          projectInfo.push(`--- ${file.filename} ---\n${preview}`);
        }
      }
    } catch (err) {
      logger.warn(`[AgentCommitAnalyzer] File exploration failed: ${err}`);
    }

    return projectInfo.join("\n\n");
  }

  private async exploreProject(): Promise<string> {
    const projectInfo: string[] = [];
    const reader = this.taskContext.reader;

    try {
      const rootEntries = reader.listDirectory(".");
      projectInfo.push(`Project root: ${rootEntries.join(", ")}`);

      const srcEntries = reader.listDirectory("src");
      if (srcEntries) projectInfo.push(`src/: ${srcEntries.join(", ")}`);

      const appEntries = reader.listDirectory("app");
      if (appEntries) projectInfo.push(`app/: ${appEntries.join(", ")}`);

      const pkgContent = reader.readFile("package.json");
      if (pkgContent && !pkgContent.startsWith("Error")) {
        const pkg = JSON.parse(pkgContent);
        const deps = Object.keys(pkg.dependencies ?? {}).slice(0, 15);
        projectInfo.push(`Dependencies: ${deps.join(", ")}`);
      }
    } catch (err) {
      logger.warn(`[AgentCommitAnalyzer] Project exploration failed: ${err}`);
    }

    return projectInfo.join("\n\n");
  }

  async run(inputState?: AgentState): Promise<AgentState> {
    const state = inputState || this.state;
    if (!state.commitDiff) {
      logger.error(`[AgentCommitAnalyzer] No commit diff provided`);
      state.error = "No commit diff provided";
      this.updateStatus(AGENT_STATUS.FAILED);
      return state;
    }

    const diff = state.commitDiff;
    const shortSha = diff.sha.slice(0, 7);

    const fileList = diff.files
      .map((f) => `  ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
      .join("\n");

    const userMessage = `Commit ${shortSha}: ${diff.message}
Author: ${diff.author}
Date: ${diff.date}
Changes: +${diff.totalAdditions}/-${diff.totalDeletions} lines across ${diff.files.length} file(s)

Files changed:
${fileList}`;

    logger.info(`[AgentCommitAnalyzer] Analyzing commit ${shortSha}`);
    logger.info(`  Message: ${diff.message.split("\n")[0]}`);
    logger.info(`  Author: ${diff.author}`);
    logger.info(`  Changes: +${diff.totalAdditions}/-${diff.totalDeletions} lines across ${diff.files.length} file(s)`);
    logger.info(`  Files changed:`);
    for (const f of diff.files) {
      logger.info(`    - ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`);
    }

    // Explore live app with MCP
    let mcpExploration = "";
    try {
      mcpExploration = await exploreAppWithMcp({
        baseUrl: this.state.apiBaseUrl || "http://localhost:3000",
      });
    } catch (err) {
      logger.warn(`[AgentCommitAnalyzer] MCP exploration skipped: ${err}`);
    }

    // Read changed files to understand context
    let fileExploration = "";
    try {
      fileExploration = await this.exploreChangedFiles(diff.files);
    } catch (err) {
      logger.warn(`[AgentCommitAnalyzer] File exploration skipped: ${err}`);
    }

    // Explore project structure
    let projectExploration = "";
    try {
      projectExploration = await this.exploreProject();
    } catch (err) {
      logger.warn(`[AgentCommitAnalyzer] Project exploration skipped: ${err}`);
    }

    try {
      const analysis = await this.runAnalysis(userMessage, mcpExploration, fileExploration, projectExploration);
      state.commitAnalysis = analysis;

      if (!analysis.needsTests) {
        logger.info(`[AgentCommitAnalyzer] Skipping commit ${shortSha}: ${analysis.reason}`);
        this.recordStep("triage_commit", analysis.reason, "goto:summarize");
      } else {
        logger.info(`[AgentCommitAnalyzer] Commit ${shortSha}: Tests needed - ${analysis.scope}`);
        logger.info(`  Reason: ${analysis.reason}`);
        if (analysis.scope) logger.info(`  Scope: ${analysis.scope}`);
        this.recordStep("triage_commit", analysis.scope || "tests needed", "next");
      }

      this.updateStatus(AGENT_STATUS.COMPLETED);
    } catch (err) {
      logger.error(`[AgentCommitAnalyzer] Commit analysis failed: ${err}`);
      state.error = `Commit analysis failed: ${err}`;
      this.updateStatus(AGENT_STATUS.FAILED);
    }

    this.sendMessage(CORE_AGENT_NAMES.SUPERVISOR, MESSAGE_TYPE.NOTIFICATION, {
      event: AGENT_EVENT.COMMIT_ANALYZED,
      commitSha: state.commitDiff?.sha?.slice(0, 7),
      needsTests: state.commitAnalysis?.needsTests ?? false,
      scope: state.commitAnalysis?.scope,
    });

    return state;
  }

  private async runAnalysis(userMessage: string, mcpExploration?: string, fileExploration?: string, projectExploration?: string): Promise<NonNullable<AgentState["commitAnalysis"]>> {
    const provider = getTaskProvider(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_COMMIT_ANALYZER, `${getTaskProviderName(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.state.agentConfig)}`);

    const systemPrompt = AgentCommitAnalyzer.buildSystemPrompt();
    const tools = [...this.getAvailableTools(), SUBMIT_COMMIT_ANALYSIS_TOOL];

    const sections: string[] = [userMessage];
    if (projectExploration) {
      sections.push(`\nProject Structure:\n${projectExploration}`);
    }
    if (fileExploration) {
      sections.push(`\nChanged Files Context:\n${fileExploration}`);
    }
    if (mcpExploration) {
      sections.push(`\nLive App Exploration:\n${mcpExploration}`);
    }
    sections.push(`\nYou have baseline context above. Use tools to investigate further if needed. Call submit_commit_analysis when ready.`);
    const fullMessage = sections.join("\n");

    const messages: ChatMessage[] = [{ role: "user", content: fullMessage }];
    const maxIterations = this.state.maxIterations ?? 50;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      logger.debug(`[AgentCommitAnalyzer] Tool loop iteration ${iteration}`);

      const response = await provider.chat({
        system: systemPrompt,
        messages,
        tools,
        maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_COMMIT_ANALYZER]?.maxTokens,
        temperature: this.state.agentConfig[AGENT_NAMES.AGENT_COMMIT_ANALYZER]?.temperature,
      });

      messages.push({ role: "assistant", content: response.content });

      const toolBlocks = response.content.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");

      if (toolBlocks.length === 0 || response.stopReason !== "tool_use") {
        logger.debug(`[AgentCommitAnalyzer] Tool loop completed after ${iteration} iterations`);
        break;
      }

      // Check for submit_commit_analysis call
      const submitBlock = toolBlocks.find(t => t.name === "submit_commit_analysis");
      if (submitBlock) {
        logger.debug(`[AgentCommitAnalyzer] Extracted analysis from tool_use block`);
        return submitBlock.input as NonNullable<AgentState["commitAnalysis"]>;
      }

      // Execute other tools
      const toolResults: ContentBlock[] = [];
      for (const toolBlock of toolBlocks) {
        logger.info(`[AgentCommitAnalyzer] Executing tool: ${toolBlock.name}`);
        const result = await this.executeTool(toolBlock.name, toolBlock.input);
        toolResults.push({
          type: "tool_result",
          toolUseId: toolBlock.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    // Fallback: extract from last assistant text message
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    if (lastAssistant) {
      const textBlocks = (Array.isArray(lastAssistant.content) ? lastAssistant.content : [])
        .filter((b): b is { type: "text"; text: string } => b.type === "text");
      const text = textBlocks.map(b => b.text).join("\n");
      if (text) {
        logger.debug(`[AgentCommitAnalyzer] Falling back to text parsing`);
        return this.parseTextFallback(text);
      }
    }

    return this.parseTextFallback("");
  }

  private parseTextFallback(text: string): NonNullable<AgentState["commitAnalysis"]> {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        logger.warn(`[AgentCommitAnalyzer] Failed to parse fallback JSON`);
      }
    }
    return {
      needsTests: true,
      reason: "Could not parse analysis, defaulting to generate tests",
      scope: null,
    };
  }
}