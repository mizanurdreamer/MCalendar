import type { AgentState } from "../core/state.js";
import type { ToolDefinition } from "../providers/types.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL } from "../utils/constants.js";

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
2. Assess risk level of changes
3. Determine if tests are needed for the changes
4. Define the scope of testing needed

Use the submit_commit_analysis tool to return your analysis with all required fields.`;
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
          id: "analyze_commit",
          tool: "analyze_commit",
          args: {},
          expectedOutcome: "Complete commit analysis with test decision",
          reasoning: "Use LLM to analyze the commit diff and determine if tests are needed",
        },
      ],
      estimatedIterations: 1,
      riskLevel: RISK_LEVEL.LOW,
      createdAt: Date.now(),
    };
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

    try {
      const analysis = await this.runAnalysis(userMessage);
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

    return state;
  }

  private async runAnalysis(userMessage: string): Promise<NonNullable<AgentState["commitAnalysis"]>> {
    const provider = getTaskProvider(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_COMMIT_ANALYZER, `${getTaskProviderName(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.state.agentConfig)}`);

    const systemPrompt = AgentCommitAnalyzer.buildSystemPrompt();

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: [SUBMIT_COMMIT_ANALYSIS_TOOL],
      toolChoice: { type: "tool", name: "submit_commit_analysis" },
      maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_COMMIT_ANALYZER]?.maxTokens,
      temperature: this.state.agentConfig[AGENT_NAMES.AGENT_COMMIT_ANALYZER]?.temperature,
    });

    // Extract from tool_use block (structured output)
    const toolBlocks = response.content.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");
    if (toolBlocks.length > 0 && toolBlocks[0].name === "submit_commit_analysis") {
      const input = toolBlocks[0].input;
      logger.debug(`[AgentCommitAnalyzer] Extracted analysis from tool_use block`);
      return input as NonNullable<AgentState["commitAnalysis"]>;
    }

    // Fallback: try to parse text response (for providers that don't support tool use)
    const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    const text = textBlocks.map((b) => b.text).join("\n");
    logger.debug(`[AgentCommitAnalyzer] No tool_use block found, falling back to text parsing`);
    return this.parseTextFallback(text);
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