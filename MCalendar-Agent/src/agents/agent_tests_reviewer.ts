import type { AgentState } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL } from "../utils/constants.js";
import { createAgentTools, executeTool } from "../utils/tools.js";
import { isMcpTool, callMcpTool } from "../mcp/client.js";
import type { ToolDefinition, ChatMessage, ContentBlock } from "../providers/types.js";

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
      riskLevel: RISK_LEVEL.MEDIUM,
      createdAt: Date.now(),
    };
  }

  async run(inputState?: AgentState): Promise<AgentState> {
    const state = inputState || this.state;
    const testFilename = state.testFilename;
    const testResult = state.testResult;
    
    if (!testFilename || !testResult) {
      logger.error(`[AgentTestsReviewer] Missing test filename or test result`);
      state.error = "Missing test filename or test result";
      this.updateStatus(AGENT_STATUS.FAILED);
      return state;
    }

    if (testResult.success) {
      logger.info(`[AgentTestsReviewer] Tests already passing, no review needed`);
      this.updateStatus(AGENT_STATUS.COMPLETED);
      return state;
    }

    const testContent = state.testContent || "";
    
    logger.info(`[AgentTestsReviewer] Starting review for ${testFilename} (attempt ${state.retries + 1})`);
    logger.info(`[AgentTestsReviewer] Test results: ${testResult.passed} passed, ${testResult.failed} failed (${testResult.total} total)`);
    
    // Log each error in detail
    logger.info(`[AgentTestsReviewer] Failed tests (${testResult.errors.length} errors):`);
    for (let i = 0; i < testResult.errors.length; i++) {
      logger.error(`  ${i + 1}. ${testResult.errors[i].slice(0, 500)}`);
    }

    try {
      const analysis = await this.runErrorAnalysis(testContent);

      state.retryHistory.push({
        attempt: state.retries,
        errors: testResult.errors,
        analysis,
      });

      // Log the error analysis result
      logger.info(`[AgentTestsReviewer] Error analysis result:`);
      try {
        const parsed = JSON.parse(analysis);
        if (parsed.root_cause) logger.info(`  Root cause: ${parsed.root_cause}`);
        if (parsed.fixes_needed?.length) {
          logger.info(`  Fixes needed:`);
          for (const fix of parsed.fixes_needed) {
            logger.info(`    - ${fix.issue} → ${fix.fix}`);
          }
        }
        if (parsed.priority) logger.info(`  Priority: ${parsed.priority}`);
      } catch {
        // If not JSON, log raw analysis
        logger.info(`  Analysis: ${analysis.slice(0, 1000)}`);
      }

      logger.info(`[AgentTestsReviewer] Applying fixes...`);
      await this.runFix(testContent, analysis);

      const path = await import("node:path");
      const testFile = path.join(state.testOutputPath, testFilename);
      const fs = await import("node:fs");
      if (fs.existsSync(testFile)) {
        state.testContent = fs.readFileSync(testFile, "utf-8");
        logger.success(`[AgentTestsReviewer] Fix applied to ${testFilename}`);
      }

      this.recordStep("review_fix", `Fixed ${testFilename} (attempt ${state.retries})`, "goto:run_tests");
      this.updateStatus(AGENT_STATUS.COMPLETED);
    } catch (err) {
      logger.error(`[AgentTestsReviewer] Test review failed: ${err}`);
      state.error = `Test review failed: ${err}`;
      this.updateStatus(AGENT_STATUS.FAILED);
    }

    return state;
  }

  private async debugAppWithMcp(): Promise<string> {
    const debugInfo: string[] = [];
    
    try {
      // Navigate to the app
      logger.info(`[AgentTestsReviewer] Debugging app with Playwright MCP...`);
      const navResult = await callMcpTool("browser_navigate", { url: "http://localhost:3000" });
      debugInfo.push(`Navigation: ${navResult.slice(0, 200)}`);
      
      // Take a screenshot
      const screenshotResult = await callMcpTool("browser_screenshot", {});
      debugInfo.push(`Screenshot: ${screenshotResult.slice(0, 200)}`);
      
      // Get console messages
      const consoleResult = await callMcpTool("browser_console_messages", {});
      debugInfo.push(`Console: ${consoleResult.slice(0, 500)}`);
      
      // Get network requests
      const networkResult = await callMcpTool("browser_network_requests", {});
      debugInfo.push(`Network: ${networkResult.slice(0, 500)}`);
      
      // Get page snapshot (DOM structure)
      const snapshotResult = await callMcpTool("browser_snapshot", {});
      debugInfo.push(`DOM Snapshot: ${snapshotResult.slice(0, 1000)}`);
      
      logger.info(`[AgentTestsReviewer] MCP debug complete`);
    } catch (err) {
      logger.warn(`[AgentTestsReviewer] MCP debug failed: ${err}`);
      debugInfo.push(`MCP Error: ${err}`);
    }
    
    return debugInfo.join("\n\n");
  }

  private async runErrorAnalysis(testContent: string): Promise<string> {
    const testFilename = this.state.testFilename;
    const testResult = this.state.testResult;
    
    if (!testFilename || !testResult) {
      return "Missing test filename or test result";
    }
    
    // Use Playwright MCP to debug the app if available
    let mcpDebugInfo = "";
    try {
      mcpDebugInfo = await this.debugAppWithMcp();
    } catch (err) {
      logger.warn(`[AgentTestsReviewer] MCP debug skipped: ${err}`);
    }
    
    const provider = getTaskProvider(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_TESTS_REVIEWER, `${getTaskProviderName(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig)}`);

    const systemPrompt = `You are a test error analyzer. Given a failing test file, its error output, and optionally live app debug info, analyze the root cause and provide a detailed fix plan.

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

${mcpDebugInfo ? `Live App Debug Info:\n${mcpDebugInfo}\n` : ""}
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
    const tools = this.getAvailableTools();

    const userMessage = `Fix the test based on this analysis:\n\n${analysis}\n\nTest file: ${testFilename}\nCurrent content:\n${testContent}\n\nErrors:\n${testResult.errors.join("\n\n")}\n\nUse write_test_file to save the fixed test.`;

    // Agentic tool-use loop
    const messages: ChatMessage[] = [
      { role: "user", content: userMessage },
    ];
    
    const maxIterations = 10;
    let iteration = 0;
    
    while (iteration < maxIterations) {
      iteration++;
      logger.debug(`[AgentTestsReviewer] Tool loop iteration ${iteration}`);
      
      const response = await provider.chat({
        system: systemPrompt,
        messages,
        tools,
        maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_REVIEWER]?.maxTokens,
        temperature: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_REVIEWER]?.temperature,
      });

      // Add assistant response to history
      messages.push({ role: "assistant", content: response.content });

      // Extract tool_use blocks
      const toolBlocks = response.content.filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");
      
      // If no tool calls, we're done
      if (toolBlocks.length === 0 || response.stopReason !== "tool_use") {
        logger.debug(`[AgentTestsReviewer] Tool loop completed after ${iteration} iterations`);
        break;
      }

      // Execute tools and collect results
      const toolResults: ContentBlock[] = [];
      
      for (const toolBlock of toolBlocks) {
        logger.debug(`[AgentTestsReviewer] Executing tool: ${toolBlock.name}`);
        const result = await this.executeTool(toolBlock.name, toolBlock.input);
        toolResults.push({
          type: "tool_result",
          toolUseId: toolBlock.id,
          content: result,
        });
      }

      // Add tool results to messages
      messages.push({ role: "user", content: toolResults });
    }

    if (iteration >= maxIterations) {
      logger.warn(`[AgentTestsReviewer] Tool loop hit max iterations (${maxIterations})`);
    }
  }

  protected getAvailableTools(): ToolDefinition[] {
    return createAgentTools(this.taskContext.reader, this.taskContext.runner, this.taskContext.codebasePath);
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    return executeTool(name, input, this.taskContext.reader, this.taskContext.runner, this.taskContext.testOutputPath, this.taskContext.codebasePath);
  }
}