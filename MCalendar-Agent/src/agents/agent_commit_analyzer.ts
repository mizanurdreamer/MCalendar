import type { AgentState } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { toSharedContext } from "../core/adapters.js";

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

Output a JSON analysis with this exact structure:
{
  "needsTests": true/false,
  "reason": "explanation of why tests are/aren't needed",
  "scope": "specific area to test (e.g., 'authentication flow', 'API validation') or null"
}

Return ONLY valid JSON.`;
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
      riskLevel: "low",
      createdAt: Date.now(),
    };
  }

  async run(): Promise<AgentState> {
    if (!this.state.commitDiff) {
      this.state.error = "No commit diff provided";
      this.updateStatus("failed");
      return this.state;
    }

    const diff = this.state.commitDiff;
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

    try {
      const output = await this.runAnalysis(userMessage);

      let analysis: NonNullable<AgentState["commitAnalysis"]>;
      try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON found");
        }
      } catch {
        analysis = { needsTests: true, reason: "Could not parse analysis, defaulting to generate tests", scope: null };
      }

      this.state.commitAnalysis = analysis;

      if (!analysis.needsTests) {
        logger.info(`[AgentCommitAnalyzer] Skipping commit ${shortSha}: ${analysis.reason}`);
        this.recordStep("triage_commit", output, "goto:summarize");
      } else {
        logger.info(`[AgentCommitAnalyzer] Commit ${shortSha}: Tests needed - ${analysis.scope}`);
        this.recordStep("triage_commit", output, "next");
      }

      this.updateStatus("completed");
    } catch (err) {
      this.state.error = `Commit analysis failed: ${err}`;
      this.updateStatus("failed");
    }

    return this.state;
  }

  private async runAnalysis(userMessage: string): Promise<string> {
    const provider = getTaskProvider(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_COMMIT_ANALYZER, `${getTaskProviderName(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_COMMIT_ANALYZER, this.state.agentConfig)}`);

    const systemPrompt = AgentCommitAnalyzer.buildSystemPrompt();
    const sharedContext = toSharedContext(this.state);

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_COMMIT_ANALYZER]?.maxTokens,
      temperature: this.state.agentConfig[AGENT_NAMES.AGENT_COMMIT_ANALYZER]?.temperature,
    });

    const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    return textBlocks.map((b) => b.text).join("\n");
  }
}