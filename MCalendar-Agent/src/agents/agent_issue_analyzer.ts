import type { AgentState } from "../core/state.js";
import type { ToolDefinition } from "../providers/types.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL, MESSAGE_TYPE, AGENT_EVENT, CORE_AGENT_NAMES } from "../utils/constants.js";

const SUBMIT_ANALYSIS_TOOL: ToolDefinition = {
  name: "submit_analysis",
  description: "Submit the issue analysis with test scenarios. Use this tool to return your analysis.",
  inputSchema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Brief summary of the issue" },
      functionality_to_test: { type: "array", items: { type: "string" }, description: "List of features to test" },
      relevant_files: { type: "array", items: { type: "string" }, description: "Files likely to be modified" },
      test_scenarios: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Scenario name" },
            type: { type: "string", enum: ["positive", "negative"], description: "Type of test" },
            description: { type: "string", description: "What to test" },
            acceptance_criterion: { type: "string", description: "Specific criterion" },
          },
          required: ["name", "type", "description", "acceptance_criterion"],
        },
        description: "Test scenarios to implement",
      },
      edge_cases: { type: "array", items: { type: "string" }, description: "Edge cases to consider" },
      api_endpoints: { type: "array", items: { type: "string" }, description: "Affected API endpoints" },
      role_checks: { type: "array", items: { type: "string" }, description: "Permission/role checks needed" },
      needs_tests: { type: "boolean", description: "Whether tests are needed" },
    },
    required: ["summary", "functionality_to_test", "relevant_files", "test_scenarios", "edge_cases", "api_endpoints", "role_checks", "needs_tests"],
  },
};

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

Use the submit_analysis tool to return your analysis with all required fields.`;
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
      riskLevel: RISK_LEVEL.LOW,
      createdAt: Date.now(),
    };
  }

  async run(inputState?: AgentState): Promise<AgentState> {
    const state = inputState || this.state;
    if (!state.issue) {
      logger.error(`[AgentIssueAnalyzer] No issue provided`);
      state.error = "No issue provided";
      this.updateStatus(AGENT_STATUS.FAILED);
      return state;
    }

    const issue = state.issue;
    const labels = issue.labels.map((l: { name: string }) => l.name).join(", ") || "none";
    const userMessage = `Issue #${issue.number}: ${issue.title}
    Labels: ${labels}
    Created: ${issue.created_at}

    ${issue.body ?? "(no description)"}`;

    logger.info(`[AgentIssueAnalyzer] Analyzing issue #${issue.number}`);

    try {
      const analysis = await this.runAnalysis(userMessage);
      state.issueAnalysis = analysis;

      if (!analysis.needs_tests) {
        logger.info(`[AgentIssueAnalyzer] Issue #${issue.number}: No tests needed - ${analysis.summary}`);
        this.recordStep("analyze_issue", analysis.summary, "goto:summarize");
      } else {
        logger.info(`[AgentIssueAnalyzer] Issue #${issue.number}: ${analysis.test_scenarios.length} test scenarios identified`);
        
        // Log functionality to test
        if (analysis.functionality_to_test?.length) {
          logger.info(`  Functionality to test: ${analysis.functionality_to_test.join(', ')}`);
        }
        
        // Log relevant files
        // if (analysis.relevant_files?.length) {
        //   logger.info(`  Relevant files:`);
        //   for (const f of analysis.relevant_files) {
        //     logger.info(`    - ${f}`);
        //   }
        // }
        
        // Log each test scenario with acceptance criterion
        for (let i = 0; i < analysis.test_scenarios.length; i++) {
          const s = analysis.test_scenarios[i];
          logger.info(`Generated Test Scenario List: `);
          logger.info(`  [${i + 1}] ${s.name} (${s.type}): ${s.description}`);
          if (s.acceptance_criterion) {
            logger.info(`      Criteria: ${s.acceptance_criterion}`);
          }
        }
        
        // Log edge cases
        if (analysis.edge_cases?.length) {
          logger.info(`  Edge cases: ${analysis.edge_cases.join(', ')}`);
        }
        
        // Log API endpoints
        if (analysis.api_endpoints?.length) {
          //logger.info(`  API endpoints: ${analysis.api_endpoints.join(', ')}`);
        }
        
        // Log role checks
        if (analysis.role_checks?.length) {
          logger.info(`  Role checks: ${analysis.role_checks.join(', ')}`);
        }
        
        this.recordStep("analyze_issue", analysis.summary, "next");
      }

      this.updateStatus(AGENT_STATUS.COMPLETED);
    } catch (err) {
      logger.error(`[AgentIssueAnalyzer] Issue analysis failed: ${err}`);
      state.error = `Issue analysis failed: ${err}`;
      this.updateStatus(AGENT_STATUS.FAILED);
    }

    this.sendMessage(CORE_AGENT_NAMES.SUPERVISOR, MESSAGE_TYPE.NOTIFICATION, {
      event: AGENT_EVENT.ISSUE_ANALYZED,
      issueNumber: state.issue?.number,
      needsTests: state.issueAnalysis?.needs_tests ?? false,
      scenarios: state.issueAnalysis?.test_scenarios?.length ?? 0,
    });

    return state;
  }

  private async runAnalysis(userMessage: string): Promise<NonNullable<AgentState["issueAnalysis"]>> {
    const provider = getTaskProvider(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_ISSUE_ANALYZER, `${getTaskProviderName(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.state.agentConfig)}`);

    const systemPrompt = AgentIssueAnalyzer.buildSystemPrompt();

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: [SUBMIT_ANALYSIS_TOOL],
      toolChoice: { type: "tool", name: "submit_analysis" },
      maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_ISSUE_ANALYZER]?.maxTokens,
      temperature: this.state.agentConfig[AGENT_NAMES.AGENT_ISSUE_ANALYZER]?.temperature,
    });

    // Extract from tool_use block (structured output)
    const toolBlocks = response.content.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");
    if (toolBlocks.length > 0 && toolBlocks[0].name === "submit_analysis") {
      const input = toolBlocks[0].input;
      logger.debug(`[AgentIssueAnalyzer] Extracted analysis from tool_use block`);
      return input as NonNullable<AgentState["issueAnalysis"]>;
    }

    // Fallback: try to parse text response (for providers that don't support tool use)
    const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    const text = textBlocks.map((b) => b.text).join("\n");
    logger.debug(`[AgentIssueAnalyzer] No tool_use block found, falling back to text parsing`);
    return this.parseTextFallback(text);
  }

  private parseTextFallback(text: string): NonNullable<AgentState["issueAnalysis"]> {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        logger.warn(`[AgentIssueAnalyzer] Failed to parse fallback JSON`);
      }
    }
    return {
      summary: text.slice(0, 500),
      functionality_to_test: [],
      relevant_files: [],
      test_scenarios: [],
      edge_cases: [],
      api_endpoints: [],
      role_checks: [],
      needs_tests: !text.toUpperCase().includes("NO_TESTS_NEEDED"),
    };
  }
}