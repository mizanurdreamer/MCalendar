import type { AgentState } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { toSharedContext } from "../core/adapters.js";

export class AgentIssueAnalyzer extends BaseAgent {
  constructor(state: AgentState, taskContext: import("../core/base_agent.js").TaskContext) {
    super(AGENT_NAMES.AGENT_ISSUE_ANALYZER, state, AgentIssueAnalyzer.buildSystemPrompt(), taskContext);
  }

  static buildSystemPrompt(): string {
    return `You are the Issue Analyzer agent. Your job is to analyze GitHub issues and determine what tests are needed.

Given an issue, you must:
1. Understand the functionality described
2. Identify relevant files and code paths
3. Define specific test scenarios with acceptance criteria
4. Determine if tests are actually needed (some issues are docs, config, etc.)

Output a JSON analysis with this exact structure:
{
  "summary": "brief summary of the issue",
  "functionality_to_test": ["list of features to test"],
  "relevant_files": ["files likely to be modified"],
  "test_scenarios": [
    {"name": "scenario name", "type": "positive|negative", "description": "what to test", "acceptance_criterion": "specific criterion"}
  ],
  "edge_cases": ["edge cases to consider"],
  "api_endpoints": ["affected API endpoints"],
  "role_checks": ["permission/role checks needed"],
  "needs_tests": true/false
}

Return ONLY valid JSON.`;
  }

  getGoal(): string {
    const issue = this.state.issue;
    return `Analyze issue #${issue?.number}: ${issue?.title} and determine test requirements`;
  }

  getDefaultPlan(): import("../core/state.js").AgentPlan {
    return {
      agent: AGENT_NAMES.AGENT_ISSUE_ANALYZER,
      goal: this.getGoal(),
      steps: [
        {
          id: "analyze_issue",
          tool: "analyze_issue",
          args: {},
          expectedOutcome: "Complete issue analysis with test scenarios",
          reasoning: "Use LLM to analyze the issue and identify test requirements",
        },
      ],
      estimatedIterations: 1,
      riskLevel: "low",
      createdAt: Date.now(),
    };
  }

  async run(): Promise<AgentState> {
    if (!this.state.issue) {
      this.state.error = "No issue provided";
      this.updateStatus("failed");
      return this.state;
    }

    const issue = this.state.issue;
    const labels = issue.labels.map((l: { name: string }) => l.name).join(", ") || "none";
    const userMessage = `Issue #${issue.number}: ${issue.title}
Labels: ${labels}
Created: ${issue.created_at}

${issue.body ?? "(no description)"}`;

    logger.info(`[AgentIssueAnalyzer] Analyzing issue #${issue.number}`);

    try {
      const output = await this.runAnalysis(userMessage);

      const analysis = this.parseIssueAnalysis(output);
      this.state.issueAnalysis = analysis;

      if (!analysis.needs_tests) {
        logger.info(`[AgentIssueAnalyzer] Issue #${issue.number}: No tests needed - ${analysis.summary}`);
        this.recordStep("analyze_issue", analysis.summary, "goto:summarize");
      } else {
        logger.info(`[AgentIssueAnalyzer] Issue #${issue.number}: ${analysis.test_scenarios.length} test scenarios identified`);
        this.recordStep("analyze_issue", analysis.summary, "next");
      }

      this.updateStatus("completed");
    } catch (err) {
      this.state.error = `Issue analysis failed: ${err}`;
      this.updateStatus("failed");
    }

    return this.state;
  }

  private async runAnalysis(userMessage: string): Promise<string> {
    const provider = getTaskProvider(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_ISSUE_ANALYZER, `${getTaskProviderName(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.state.agentConfig)}`);

    const systemPrompt = AgentIssueAnalyzer.buildSystemPrompt();
    const sharedContext = toSharedContext(this.state);

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_ISSUE_ANALYZER]?.maxTokens,
      temperature: this.state.agentConfig[AGENT_NAMES.AGENT_ISSUE_ANALYZER]?.temperature,
    });

    const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    const result = textBlocks.map((b) => b.text).join("\n");
    
    logger.debug(`[AgentIssueAnalyzer] Response received (${result.length} chars)`);
    
    return result;
  }

  private parseIssueAnalysis(raw: string): NonNullable<AgentState["issueAnalysis"]> {
    logger.debug(`[AgentIssueAnalyzer] Parsing response (${raw.length} chars)`);
    
    try {
      // Use non-greedy match to avoid catastrophic backtracking on large responses
      const jsonMatch = raw.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      logger.warn(`[AgentIssueAnalyzer] JSON parse failed: ${err}`);
    }
    return {
      summary: raw.slice(0, 500),
      functionality_to_test: [],
      relevant_files: [],
      test_scenarios: [],
      edge_cases: [],
      api_endpoints: [],
      role_checks: [],
      needs_tests: !raw.toUpperCase().includes("NO_TESTS_NEEDED"),
    };
  }
}