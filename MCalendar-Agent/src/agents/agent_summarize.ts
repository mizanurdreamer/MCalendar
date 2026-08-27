import type { AgentState } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { formatTestReport } from "../test_runner/reporter.js";
import { logger } from "../utils/logger.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { toSharedContext } from "../core/adapters.js";

export class AgentSummarize extends BaseAgent {
  constructor(state: AgentState, taskContext: import("../core/base_agent.js").TaskContext) {
    super(AGENT_NAMES.AGENT_SUMMARIZE, state, AgentSummarize.buildSystemPrompt(), taskContext);
  }

  static buildSystemPrompt(): string {
    return `You are the Summarize agent. Your job is to create a concise summary of the test generation pipeline for GitHub comments.

Create a summary that includes:
1. What was analyzed (issue/commit)
2. What tests were generated
3. Test results (passed/failed)
3. Key findings
4. Links to reports and PRs

Keep it concise and actionable for developers.`;
  }

  getGoal(): string {
    if (this.state.mode === "issue" && this.state.issue) {
      return `Summarize test results for issue #${this.state.issue.number}`;
    } else if (this.state.mode === "commit" && this.state.commitDiff) {
      return `Summarize test results for commit ${this.state.commitDiff.sha.slice(0,7)}`;
    }
    return "Summarize test results";
  }

  getDefaultPlan(): import("../core/state.js").AgentPlan {
    return {
      agent: AGENT_NAMES.AGENT_SUMMARIZE,
      goal: this.getGoal(),
      steps: [
        {
          id: "generate_summary",
          tool: "generate_summary",
          args: {},
          expectedOutcome: "Concise summary for GitHub comment",
          reasoning: "Create final summary from all pipeline results",
        },
      ],
      estimatedIterations: 1,
      riskLevel: "low",
      createdAt: Date.now(),
    };
  }

  async run(): Promise<AgentState> {
    let userMessage: string;

    if (this.state.mode === "issue" && this.state.issue) {
      userMessage = `Summarize these test results for a GitHub comment:

Issue: #${this.state.issue.number} — ${this.state.issue.title}
Branch: ${this.state.branchName}
Test file: ${this.state.testFilename}

Test Results:
${this.state.testResult ? formatTestReport(this.state.testResult) : "(no results)"}

Report:
${this.state.report ?? "(no report)"}`;
    } else if (this.state.mode === "commit" && this.state.commitDiff) {
      const shortSha = this.state.commitDiff.sha.slice(0, 7);
      userMessage = `Summarize these test results for a GitHub comment:

Commit: ${shortSha} — ${this.state.commitDiff.message.split("\n")[0]}
Branch: ${this.state.branchName}
Test file: ${this.state.testFilename}

Test Results:
${this.state.testResult ? formatTestReport(this.state.testResult) : "(no results)"}

Report:
${this.state.report ?? "(no report)"}`;
    } else {
      this.updateStatus("completed");
      return this.state;
    }

    try {
      const output = await this.runSummarization(userMessage);

      this.state.summary = output;

      if (this.state.githubClient && this.state.issue) {
        await this.state.githubClient.addComment(this.state.issue.number, output);
      } else if (this.state.githubClient && this.state.mode === "commit" && this.state.prUrl) {
        await this.state.githubClient.addPRComment(this.state.prUrl, output);
      }

      this.recordStep("summarize", output, "done");
      this.updateStatus("completed");
    } catch (err) {
      this.state.error = `Summarize failed: ${err}`;
      this.updateStatus("failed");
    }

    return this.state;
  }

  private async runSummarization(userMessage: string): Promise<string> {
    const provider = getTaskProvider(AGENT_NAMES.AGENT_SUMMARIZE, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_SUMMARIZE, `${getTaskProviderName(AGENT_NAMES.AGENT_SUMMARIZE, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_SUMMARIZE, this.state.agentConfig)}`);

    const systemPrompt = AgentSummarize.buildSystemPrompt();
    const sharedContext = toSharedContext(this.state);

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_SUMMARIZE]?.maxTokens,
      temperature: this.state.agentConfig[AGENT_NAMES.AGENT_SUMMARIZE]?.temperature,
    });

    const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    return textBlocks.map((b) => b.text).join("\n");
  }
}