import type { AgentState, AgentName, AgentPlan, PlanStep, ExecutionFeedback } from "./state.js";
import { logger } from "../utils/logger.js";
import type { ProviderInterface } from "../providers/types.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { GRAPH_NODE, MODE, RISK_LEVEL } from "../utils/constants.js";

export interface PlannerConfig {
  enabled: boolean;
}

export class PlanGenerator {
  private state: AgentState;
  private config: PlannerConfig;
  private provider?: ProviderInterface;

  constructor(state: AgentState, config: PlannerConfig = { enabled: true }) {
    this.state = state;
    this.config = config;
    this.provider = (state as any).provider;
  }

  setProvider(provider: ProviderInterface): void {
    this.provider = provider;
  }

  async generatePlan(): Promise<AgentPlan> {
    if (!this.config.enabled || !this.provider) {
      return this.getDefaultPlan();
    }

    const prompt = this.buildPlanPrompt();
    
    try {
      const response = await this.provider.chat({
        system: "You are a test pipeline planner. Decide which agents to SKIP for this task. The core sequence is fixed — you only choose which steps to skip and what guidance to provide.",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 2048,
        temperature: 0.2,
        promptCaching: true,
        signal: this.state.abortSignal,
      });

      const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
      const raw = textBlocks.map((b) => b.text).join("\n");
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]) as AgentPlan;
        return this.validatePlan(plan);
      }
    } catch (err) {
      logger.warn(`[PlanGenerator] Plan generation failed: ${err}`);
    }

    return this.getDefaultPlan();
  }

  async generateRevisedPlan(executionFeedback: ExecutionFeedback[]): Promise<AgentPlan> {
    if (!this.config.enabled || !this.provider) {
      return this.getDefaultPlan();
    }

    const feedbackSummary = this.formatExecutionFeedback(executionFeedback);
    const prompt = this.buildRevisedPlanPrompt(feedbackSummary);
    
    try {
      const response = await this.provider.chat({
        system: "You are a test pipeline planner. Revise the pipeline plan based on execution feedback. Decide which agents to SKIP and what guidance to provide. The core sequence is fixed.",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 2048,
        temperature: 0.2,
        promptCaching: true,
        signal: this.state.abortSignal,
      });

      const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
      const raw = textBlocks.map((b) => b.text).join("\n");
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]) as AgentPlan;
        return this.validatePlan(plan);
      }
    } catch (err) {
      logger.warn(`[PlanGenerator] Revised plan generation failed: ${err}`);
    }

    return this.getDefaultPlan();
  }

  private buildPlanPrompt(): string {
    const { mode, issue, commitDiff, issueAnalysis, commitAnalysis, testResult, retries, testReviewMaxRetries: maxRetries, projectContext } = this.state;

    const taskInfo = mode === MODE.ISSUE
      ? `Issue: #${issue?.number} - ${issue?.title}`
      : `Commit: ${commitDiff?.sha?.slice(0, 7)} - ${commitDiff?.message?.slice(0, 100)}`;

    const analysisInfo = mode === MODE.ISSUE
      ? (issueAnalysis ? `Issue analysis:\n- Summary: ${issueAnalysis.summary}\n- Needs tests: ${issueAnalysis.needs_tests}\n- Scenarios: ${issueAnalysis.test_scenarios?.length}` : "No issue analysis yet")
      : (commitAnalysis ? `Commit analysis:\n- Needs tests: ${commitAnalysis.needsTests}\n- Scope: ${commitAnalysis.scope}` : "No commit analysis yet");

    const projectInfo = projectContext
      ? `Project context:\n- Framework: ${projectContext.framework}\n- Test runner: ${projectContext.testRunner}`
      : "No project context available";

    return `Create a PIPELINE PLAN for: ${taskInfo}

${analysisInfo}
${projectInfo}
Retries: ${retries}/${maxRetries}
${testResult ? `Last test result: ${testResult.success ? "PASSED" : "FAILED"} (${testResult.passed}/${testResult.total})` : "No test run yet"}

Core sequence (always in this order):
1. ${AGENT_NAMES.AGENT_ISSUE_ANALYZER} (issue mode) OR ${AGENT_NAMES.AGENT_COMMIT_ANALYZER} (commit mode)
2. ${AGENT_NAMES.AGENT_TESTS_GENERATOR}
3. ${GRAPH_NODE.RUN_TESTS}
4. ${AGENT_NAMES.AGENT_TESTS_REVIEWER}
5. ${AGENT_NAMES.AGENT_CODE_FIXER} (only if target code issues found)
6. ${AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR}
7. ${AGENT_NAMES.AGENT_SUMMARIZE}

Return JSON:
{
  "steps": [
    { "agent": "agent_name", "skip": "reason to skip (omit if agent should run)", "guidance": "what to focus on (omit if no special guidance)" }
  ],
  "riskLevel": "${RISK_LEVEL.LOW}|${RISK_LEVEL.MEDIUM}|${RISK_LEVEL.HIGH}"
}

Rules:
- Include ALL agents in the steps array, in the core sequence order
- Add skip reason only for agents that should be skipped
- Add guidance only for agents that need specific instructions
- Never skip ${GRAPH_NODE.RUN_TESTS} if tests exist
- Never skip ${AGENT_NAMES.AGENT_SUMMARIZE} (terminal agent)
- For issue mode, skip ${AGENT_NAMES.AGENT_COMMIT_ANALYZER}
- For commit mode, skip ${AGENT_NAMES.AGENT_ISSUE_ANALYZER}`;
  }

  private buildRevisedPlanPrompt(feedbackSummary: string): string {
    const { mode, issue, commitDiff, retries, testReviewMaxRetries: maxRetries, projectContext } = this.state;

    const taskInfo = mode === MODE.ISSUE
      ? `Issue: #${issue?.number} - ${issue?.title}`
      : `Commit: ${commitDiff?.sha?.slice(0, 7)} - ${commitDiff?.message?.slice(0, 100)}`;

    const projectInfo = projectContext
      ? `Project context:\n- Framework: ${projectContext.framework}\n- Test runner: ${projectContext.testRunner}`
      : "No project context available";

    return `REVISE the pipeline plan for: ${taskInfo}

${feedbackSummary}
${projectInfo}
Retries: ${retries}/${maxRetries}

Core sequence (always in this order):
1. ${AGENT_NAMES.AGENT_ISSUE_ANALYZER} (issue mode) OR ${AGENT_NAMES.AGENT_COMMIT_ANALYZER} (commit mode)
2. ${AGENT_NAMES.AGENT_TESTS_GENERATOR}
3. ${GRAPH_NODE.RUN_TESTS}
4. ${AGENT_NAMES.AGENT_TESTS_REVIEWER}
5. ${AGENT_NAMES.AGENT_CODE_FIXER} (only if target code issues found)
6. ${AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR}
7. ${AGENT_NAMES.AGENT_SUMMARIZE}

Return JSON:
{
  "steps": [
    { "agent": "agent_name", "skip": "reason to skip (omit if agent should run)", "guidance": "revised guidance based on feedback" }
  ],
  "riskLevel": "${RISK_LEVEL.LOW}|${RISK_LEVEL.MEDIUM}|${RISK_LEVEL.HIGH}"
}

Rules:
- Focus on fixing the weaknesses identified in the feedback
- Adjust guidance to address specific failures
- Include ALL agents in the steps array`;
  }

  private formatExecutionFeedback(feedback: ExecutionFeedback[]): string {
    if (feedback.length === 0) return "No execution feedback available.";
    
    let summary = "EXECUTION FEEDBACK:\n\n";
    
    for (const fb of feedback) {
      summary += `Agent: ${fb.agent}\n`;
      summary += `Score: ${fb.score}/100\n`;
      if (fb.weaknesses.length > 0) {
        summary += `Weaknesses: ${fb.weaknesses.join(", ")}\n`;
      }
      if (fb.suggestions.length > 0) {
        summary += `Suggestions: ${fb.suggestions.join(", ")}\n`;
      }
      summary += "\n";
    }
    
    return summary;
  }

  private validatePlan(plan: AgentPlan): AgentPlan {
    // Ensure steps array exists
    if (!plan.steps || !Array.isArray(plan.steps)) {
      return this.getDefaultPlan();
    }

    // Validate each step
    const validSteps: PlanStep[] = [];
    for (const step of plan.steps) {
      if (!step.agent) continue;
      validSteps.push({
        agent: step.agent,
        skip: step.skip || undefined,
        guidance: step.guidance || undefined,
      });
    }

    return {
      steps: validSteps,
      riskLevel: [RISK_LEVEL.LOW, RISK_LEVEL.MEDIUM, RISK_LEVEL.HIGH].includes(plan.riskLevel as any)
        ? plan.riskLevel
        : RISK_LEVEL.MEDIUM,
    };
  }

  private getDefaultPlan(): AgentPlan {
    const isIssueMode = this.state.mode === MODE.ISSUE;
    
    const steps: PlanStep[] = [
      { agent: isIssueMode ? AGENT_NAMES.AGENT_ISSUE_ANALYZER : AGENT_NAMES.AGENT_COMMIT_ANALYZER },
      { agent: AGENT_NAMES.AGENT_TESTS_GENERATOR },
      { agent: GRAPH_NODE.RUN_TESTS as AgentName },
      { agent: AGENT_NAMES.AGENT_TESTS_REVIEWER },
      { agent: AGENT_NAMES.AGENT_CODE_FIXER },
      { agent: AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR },
      { agent: AGENT_NAMES.AGENT_SUMMARIZE },
    ];

    return {
      steps,
      riskLevel: RISK_LEVEL.MEDIUM,
    };
  }
}
