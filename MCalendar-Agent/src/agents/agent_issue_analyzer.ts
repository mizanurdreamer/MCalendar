import type { AgentState } from "../core/state.js";
import type { ToolDefinition } from "../providers/types.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL, MESSAGE_TYPE, AGENT_EVENT, CORE_AGENT_NAMES } from "../utils/constants.js";
import { getToolRegistry } from "../core/tool_registry.js";
import { exploreAppWithMcp } from "../mcp/explore.js";

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
2. Explore the live app and codebase to understand the actual UI and code
3. Identify relevant files and code paths
4. Define specific test scenarios with acceptance criteria
5. Determine if tests are actually needed (some issues are docs, config, etc.)

CRITICAL: When to set needs_tests = true:
- ANY issue that involves CRUD operations (Create, Read, Update, Delete) → needs_tests = true
- ANY issue that involves UI functionality, forms, pages, or user interactions → needs_tests = true
- ANY issue that involves API endpoints or data operations → needs_tests = true
- ANY issue that mentions "test", "verify", "check", "validate", "ensure" → needs_tests = true
- ANY issue that describes functionality to implement → needs_tests = true
- ONLY set needs_tests = false for pure documentation, README, comment-only, or config changes with no functional impact

When in doubt, set needs_tests = true and provide test scenarios. It is ALWAYS better to generate tests than to skip them.

BASELINE CONTEXT:
You will receive pre-explored project structure and live app exploration in your first message. This is your baseline understanding. Use it as a starting point.

ALL TOOLS AVAILABLE TO YOU:
File & Code Exploration:
- read_file: Read any source file (e.g., 'src/app/page.tsx')
- list_directory: List directory contents
- find_usage: Find where a function/variable is used
- find_definition: Find where a function/variable is defined

Shell & Dev:
- run_command: Execute any shell command (e.g., 'ls', 'cat', 'find')
- npm_command: Run npm scripts (e.g., 'npm run dev', 'npm test')
- git_log: View recent git commits
- git_diff: View git diff for changes
- lint_code: Run linter on code
- check_types: Run TypeScript type checking

Database:
- database_schema: Query database schema
- query_database: Run SQL queries

Browser (if app running):
- browser_navigate: Navigate to a URL
- browser_snapshot: Get DOM structure
- browser_screenshot: Take a screenshot
- browser_click: Click an element
- browser_type: Type text into input
- browser_console_messages: Get console output

Debugging:
- check_process: Check running processes
- check_port: Check what's on a port
- env_check: Check environment variables
- read_server_logs: Read application logs

WHEN TO USE TOOLS:
Use tools to explore the codebase and understand the issue thoroughly:
- Read source files to understand implementation details
- Use find_usage/find_definition to trace code paths
- Run git_log/git_diff to see recent changes
- Use database_schema to understand data models
- Navigate to relevant pages to verify UI elements (if app running)
- Run commands to check project structure and dependencies

When you have enough information, call submit_analysis with your complete analysis.`;
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
          id: "explore_app",
          tool: "browser_navigate",
          args: {},
          expectedOutcome: "Explore live app to understand current UI state",
          reasoning: "Browser exploration helps ground test scenarios in the real app",
        },
        {
          id: "analyze_issue",
          tool: "submit_analysis",
          args: {},
          expectedOutcome: "Complete issue analysis with test scenarios",
          reasoning: "Use LLM to analyze the issue and identify test requirements",
        },
      ],
      estimatedIterations: 2,
      riskLevel: RISK_LEVEL.LOW,
      createdAt: Date.now(),
    };
  }

  protected getAvailableTools(): ToolDefinition[] {
    return getToolRegistry().getByRole("issue_analyzer");
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
      logger.warn(`[AgentIssueAnalyzer] Project exploration failed: ${err}`);
    }

    return projectInfo.join("\n\n");
  }

  async run(inputState?: AgentState): Promise<AgentState> {
    const state = inputState || this.state;
    if (!state.issue) {
      logger.error(`[AgentIssueAnalyzer] No issue provided`);
      state.error = "No issue provided";
      this.updateStatus(AGENT_STATUS.FAILED);
      return state;
    }

    // Recall past lessons to improve analysis
    const lessons = await this.recallLessons();
    if (lessons) {
      logger.info(`[AgentIssueAnalyzer] Recalled ${lessons.split("\n").length} lines of past lessons`);
    }

    const issue = state.issue;
    const labels = issue.labels.map((l: { name: string }) => l.name).join(", ") || "none";
    
    // Build plan context if available
    const planContext = this.taskContext.currentPlanStep 
      ? `\n\nPlan Context:\n- Step: ${this.taskContext.currentPlanStep.reasoning}\n- Expected Outcome: ${this.taskContext.currentPlanStep.expectedOutcome}`
      : '';
    
    const userMessage = `Issue #${issue.number}: ${issue.title}
    Labels: ${labels}
    Created: ${issue.created_at}

    ${issue.body ?? "(no description)"}${planContext}`;

    logger.info(`[AgentIssueAnalyzer] Analyzing issue #${issue.number}`);

    // Explore live app with MCP
    let mcpExploration = "";
    try {
      mcpExploration = await exploreAppWithMcp({
        baseUrl: this.state.apiBaseUrl || "http://localhost:3000",
      });
    } catch (err) {
      logger.warn(`[AgentIssueAnalyzer] MCP exploration skipped: ${err}`);
    }

    // Explore project structure
    let projectExploration = "";
    try {
      projectExploration = await this.exploreProject();
    } catch (err) {
      logger.warn(`[AgentIssueAnalyzer] Project exploration skipped: ${err}`);
    }

    try {
      const analysis = await this.runAnalysis(userMessage, mcpExploration, projectExploration, lessons);
      state.issueAnalysis = analysis;

      if (!analysis.needs_tests) {
        // Safety check: if summary mentions testing-related keywords, override needs_tests
        const summaryLower = (analysis.summary ?? "").toLowerCase();
        const needsTestsKeywords = ["test", "crud", "create", "update", "delete", "validation", "form", "page", "api", "endpoint", "functionality", "feature"];
        const hasTestKeywords = needsTestsKeywords.some((kw) => summaryLower.includes(kw));
        if (hasTestKeywords && (!analysis.test_scenarios || analysis.test_scenarios.length === 0)) {
          logger.warn(`[AgentIssueAnalyzer] Override: summary mentions test-related keywords but needs_tests=false, forcing needs_tests=true`);
          analysis.needs_tests = true;
          // Generate placeholder test scenarios if none provided
          if (!analysis.test_scenarios || analysis.test_scenarios.length === 0) {
            analysis.test_scenarios = [
              {
                name: "Basic functionality test",
                type: "positive" as const,
                description: `Test the core functionality described in the issue: ${analysis.summary?.slice(0, 200)}`,
                acceptance_criterion: "Feature works as described in the issue",
              },
            ];
          }
        }
      }

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

      // Self-reflect on the analysis quality
      const reflection = await this.reflect(JSON.stringify(state.issueAnalysis, null, 2));
      this.recordReflection(reflection, state);

      if (reflection.shouldRevise) {
        logger.warn(`[AgentIssueAnalyzer] Reflection suggests revision (score: ${reflection.score}): ${reflection.weaknesses.join(", ")}`);
      }

      this.updateStatus(AGENT_STATUS.COMPLETED);
    } catch (err) {
      logger.error(`[AgentIssueAnalyzer] Issue analysis failed: ${err}`);
      state.error = `Issue analysis failed: ${err}`;
      this.updateStatus(AGENT_STATUS.FAILED);
    }

    // Send analysis results to TestsGenerator
    if (state.issueAnalysis) {
      this.sendMessage(AGENT_NAMES.AGENT_TESTS_GENERATOR, MESSAGE_TYPE.FEEDBACK, {
        event: "issue_analyzed",
        issueNumber: state.issue?.number,
        needsTests: state.issueAnalysis.needs_tests,
        scenarios: state.issueAnalysis.test_scenarios,
        summary: state.issueAnalysis.summary,
      });
    }

    this.sendMessage(CORE_AGENT_NAMES.SUPERVISOR, MESSAGE_TYPE.NOTIFICATION, {
      event: AGENT_EVENT.ISSUE_ANALYZED,
      issueNumber: state.issue?.number,
      needsTests: state.issueAnalysis?.needs_tests ?? false,
      scenarios: state.issueAnalysis?.test_scenarios?.length ?? 0,
    });

    return state;
  }

  private async runAnalysis(userMessage: string, mcpExploration?: string, projectExploration?: string, lessons?: string): Promise<NonNullable<AgentState["issueAnalysis"]>> {
    logger.task(AGENT_NAMES.AGENT_ISSUE_ANALYZER, `${getTaskProviderName(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_ISSUE_ANALYZER, this.state.agentConfig)}`);

    const systemPrompt = AgentIssueAnalyzer.buildSystemPrompt();
    const tools = [...this.getAvailableTools(), SUBMIT_ANALYSIS_TOOL];

    const sections: string[] = [userMessage];
    if (projectExploration) {
      sections.push(`\nProject Structure:\n${projectExploration}`);
    }
    if (mcpExploration) {
      sections.push(`\nLive App Exploration:\n${mcpExploration}`);
    }
    if (lessons) {
      sections.push(lessons);
    }
    sections.push(`\nYou have baseline context above. Use tools to investigate further if needed. Call submit_analysis when ready.`);
    const fullMessage = sections.join("\n");

    const { messages } = await this.runToolLoop({
      systemPrompt,
      userMessage: fullMessage,
      tools,
      agentName: AGENT_NAMES.AGENT_ISSUE_ANALYZER,
      onToolCall: (toolBlocks) => {
        const submitBlock = toolBlocks.find(t => t.name === "submit_analysis");
        if (submitBlock) {
          return { intercept: true, result: submitBlock.input };
        }
        return { intercept: false };
      },
    });

    // Check if submit_analysis was intercepted
    for (const msg of messages) {
      if (msg.role === "assistant") {
        const toolBlocks = (Array.isArray(msg.content) ? msg.content : [])
          .filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");
        const submitBlock = toolBlocks.find(t => t.name === "submit_analysis");
        if (submitBlock) {
          return submitBlock.input as NonNullable<AgentState["issueAnalysis"]>;
        }
      }
    }

    // Fallback: extract from last assistant text message
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    if (lastAssistant) {
      const textBlocks = (Array.isArray(lastAssistant.content) ? lastAssistant.content : [])
        .filter((b): b is { type: "text"; text: string } => b.type === "text");
      const text = textBlocks.map(b => b.text).join("\n");
      if (text) {
        logger.debug(`[AgentIssueAnalyzer] Falling back to text parsing`);
        return this.parseTextFallback(text);
      }
    }

    return this.parseTextFallback("");
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