import type { AgentState } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { toSharedContext } from "../core/adapters.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { createAgentTools, executeTool } from "../utils/tools.js";
import type { ToolDefinition } from "../providers/types.js";

export class AgentTestsReviewer extends BaseAgent {
  constructor(state: AgentState, taskContext: import("../core/base_agent.js").TaskContext) {
    super(AGENT_NAMES.AGENT_TESTS_REVIEWER, state, AgentTestsReviewer.buildSystemPrompt(), taskContext);
  }

  static buildSystemPrompt(): string {
    return `You are the Test Reviewer agent. Your job is to fix failing tests based on error analysis.

Process:
1. Analyze test errors to understand root cause
2. Fix the test code to resolve issues
3. Re-run tests to verify fixes

You have access to:
- The failing test file content
- Test execution errors and output
- Ability to read source files for context
- write_test_file tool to save fixes

Focus on:
- Selector issues (wrong locators, timing)
- Test logic errors
- Missing setup/teardown
- Data dependencies
- Async/await problems

Return the fixed test file content via write_test_file tool.`;
  }

  getGoal(): string {
    return `Fix failing tests for ${this.state.testFilename} (attempt ${this.state.retries + 1}/${this.state.maxRetries})`;
  }

  getDefaultPlan(): import("../core/state.js").AgentPlan {
    return {
      agent: AGENT_NAMES.AGENT_TESTS_REVIEWER,
      goal: this.getGoal(),
      steps: [
        {
          id: "analyze_errors",
          tool: "analyze_test_error",
          args: {},
          expectedOutcome: "Root cause analysis of test failures",
          reasoning: "Understand why tests are failing before fixing",
        },
        {
          id: "fix_tests",
          tool: "write_test_file",
          args: { filename: this.state.testFilename || "test.spec.ts", content: "" },
          expectedOutcome: "Fixed test file that passes",
          reasoning: "Apply fixes based on error analysis",
          dependsOn: ["analyze_errors"],
        },
      ],
      estimatedIterations: 2,
      riskLevel: "medium",
      createdAt: Date.now(),
    };
  }

  async run(): Promise<AgentState> {
    const testFilename = this.state.testFilename;
    const testResult = this.state.testResult;
    
    if (!testFilename || !testResult) {
      this.state.error = "Missing test filename or test result";
      this.updateStatus("failed");
      return this.state;
    }

    if (testResult.success) {
      logger.info(`[AgentTestsReviewer] Tests already passing, no review needed`);
      this.updateStatus("completed");
      return this.state;
    }

    const testContent = this.state.testContent || "";
    
    logger.info(`[AgentTestsReviewer] Starting review for ${testFilename} (attempt ${this.state.retries + 1})`);
    logger.info(`[AgentTestsReviewer] Errors: ${testResult.errors.length}`);

    try {
      const analysis = await this.runErrorAnalysis(testContent);

      this.state.retryHistory.push({
        attempt: this.state.retries,
        errors: testResult.errors,
        analysis,
      });

      logger.info(`[AgentTestsReviewer] Error analysis complete, applying fixes`);

      await this.runFix(testContent, analysis);

      const testFile = `${this.state.testOutputPath}/${testFilename}`;
      const fs = await import("node:fs");
      if (fs.existsSync(testFile)) {
        this.state.testContent = fs.readFileSync(testFile, "utf-8");
      }

      this.recordStep("review_fix", `Fixed ${testFilename} (attempt ${this.state.retries})`, "goto:run_tests");
      this.updateStatus("completed");
    } catch (err) {
      this.state.error = `Test review failed: ${err}`;
      this.updateStatus("failed");
    }

    return this.state;
  }

  private async runErrorAnalysis(testContent: string): Promise<string> {
    const testFilename = this.state.testFilename;
    const testResult = this.state.testResult;
    
    if (!testFilename || !testResult) {
      return "Missing test filename or test result";
    }
    
    const provider = getTaskProvider(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_TESTS_REVIEWER, `${getTaskProviderName(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig)}`);

    const systemPrompt = `You are a test error analyzer. Given a failing test file and its error output, analyze the root cause and provide a detailed fix plan.

Output a JSON with this structure:
{
  "root_cause": "description of the root cause",
  "fixes_needed": [
    {"file": "test file path", "issue": "what's wrong", "fix": "how to fix it"}
  ],
  "priority": "high|medium|low"
}`;

    const userMessage = `Test file: ${testFilename}
Test content:
${testContent}

Test errors:
${testResult.errors.join("\n\n")}

Retry history:
${this.state.retryHistory.map((r, i) => `Attempt ${i + 1}: ${r.errors.join("; ")}`).join("\n")}

Analyze the errors and provide a fix plan.`;

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_REVIEWER]?.maxTokens,
      temperature: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_REVIEWER]?.temperature,
    });

    const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    return textBlocks.map((b) => b.text).join("\n");
  }

  private async runFix(testContent: string, analysis: string): Promise<void> {
    const testFilename = this.state.testFilename;
    const testResult = this.state.testResult;
    
    if (!testFilename || !testResult) {
      return;
    }
    
    const provider = getTaskProvider(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_TESTS_REVIEWER, `${getTaskProviderName(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig)}`);

    const systemPrompt = AgentTestsReviewer.buildSystemPrompt();
    const sharedContext = toSharedContext(this.state);

    const userMessage = `Fix the test based on this analysis:\n\n${analysis}\n\nTest file: ${testFilename}\nCurrent content:\n${testContent}\n\nErrors:\n${testResult.errors.join("\n\n")}\n\nUse write_test_file to save the fixed test.`;

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: this.getAvailableTools(),
      maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_REVIEWER]?.maxTokens,
      temperature: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_REVIEWER]?.temperature,
    });

    const toolBlocks = response.content.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");
    for (const toolBlock of toolBlocks) {
      await this.executeTool(toolBlock.name, toolBlock.input);
    }
  }

  protected getAvailableTools(): ToolDefinition[] {
    return createAgentTools(this.taskContext.reader, this.taskContext.runner, this.taskContext.codebasePath);
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    return executeTool(name, input, this.taskContext.reader, this.taskContext.runner, this.taskContext.testOutputPath, this.taskContext.codebasePath);
  }
}