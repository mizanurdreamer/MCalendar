import type { AgentState } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { formatTestReport } from "../test_runner/reporter.js";
import { logger } from "../utils/logger.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL } from "../utils/constants.js";

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
    if (this.state.mode === MODE.ISSUE && this.state.issue) {
      return `Summarize test results for issue #${this.state.issue.number}`;
    } else if (this.state.mode === MODE.COMMIT && this.state.commitDiff) {
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
      riskLevel: RISK_LEVEL.LOW,
      createdAt: Date.now(),
    };
  }

  async run(inputState?: AgentState): Promise<AgentState> {
    const state = inputState || this.state;
    let userMessage: string;

    if (state.mode === MODE.ISSUE && state.issue) {
      logger.info(`[AgentSummarize] Summarizing issue #${state.issue.number} pipeline results`);
      logger.info(`  Issue: #${state.issue.number} — ${state.issue.title}`);
      logger.info(`  Branch: ${state.branchName}`);
      logger.info(`  Test file: ${state.testFilename}`);
      
      if (state.testResult) {
        logger.info(`  Test results: ${state.testResult.passed} passed, ${state.testResult.failed} failed (${state.testResult.total} total)`);
      }
      
      userMessage = `Summarize these test results for a GitHub comment:

Issue: #${state.issue.number} — ${state.issue.title}
Branch: ${state.branchName}
Test file: ${state.testFilename}

Test Results:
${state.testResult ? formatTestReport(state.testResult) : "(no results)"}

Report:
${state.report ?? "(no report)"}`;
    } else if (state.mode === MODE.COMMIT && state.commitDiff) {
      const shortSha = state.commitDiff.sha.slice(0, 7);
      logger.info(`[AgentSummarize] Summarizing commit ${shortSha} pipeline results`);
      logger.info(`  Commit: ${shortSha} — ${state.commitDiff.message.split("\n")[0]}`);
      logger.info(`  Branch: ${state.branchName}`);
      logger.info(`  Test file: ${state.testFilename}`);
      
      if (state.testResult) {
        logger.info(`  Test results: ${state.testResult.passed} passed, ${state.testResult.failed} failed (${state.testResult.total} total)`);
      }
      
      userMessage = `Summarize these test results for a GitHub comment:

Commit: ${shortSha} — ${state.commitDiff.message.split("\n")[0]}
Branch: ${state.branchName}
Test file: ${state.testFilename}

Test Results:
${state.testResult ? formatTestReport(state.testResult) : "(no results)"}

Report:
${state.report ?? "(no report)"}`;
    } else {
      logger.warn(`[AgentSummarize] No mode/issue/commit to summarize, skipping`);
      this.updateStatus(AGENT_STATUS.COMPLETED);
      return state;
    }

    try {
      const output = await this.runSummarization(userMessage);

      state.summary = output;
      
      // Log the generated summary
      logger.info(`[AgentSummarize] Summary generated (${output.length} chars):`);
      const summaryLines = output.split('\n').slice(0, 20);
      for (const line of summaryLines) {
        logger.info(`  ${line}`);
      }

      // Log GitHub comment posting
      if (state.githubClient && state.issue) {
        await state.githubClient.addComment(state.issue.number, output);
        logger.success(`[AgentSummarize] Posted comment to issue #${state.issue.number}`);
      } else if (state.githubClient && state.mode === MODE.COMMIT && state.prUrl) {
        await state.githubClient.addPRComment(state.prUrl, output);
        logger.success(`[AgentSummarize] Posted comment to PR ${state.prUrl}`);
      } else {
        logger.warn(`[AgentSummarize] No GitHub client available, skipping comment`);
      }

      this.recordStep("summarize", output, "done");
      this.updateStatus(AGENT_STATUS.COMPLETED);
    } catch (err) {
      logger.error(`[AgentSummarize] Summarize failed: ${err}`);
      state.error = `Summarize failed: ${err}`;
      this.updateStatus(AGENT_STATUS.FAILED);
    }

    return state;
  }

  private async runSummarization(userMessage: string): Promise<string> {
    const provider = getTaskProvider(AGENT_NAMES.AGENT_SUMMARIZE, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_SUMMARIZE, `${getTaskProviderName(AGENT_NAMES.AGENT_SUMMARIZE, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_SUMMARIZE, this.state.agentConfig)}`);

    const systemPrompt = AgentSummarize.buildSystemPrompt();

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