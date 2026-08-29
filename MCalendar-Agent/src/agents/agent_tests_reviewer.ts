import type { AgentState } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL, MESSAGE_TYPE, AGENT_EVENT, CORE_AGENT_NAMES } from "../utils/constants.js";
import { createAgentTools, executeTool } from "../utils/tools.js";
import { isMcpTool, callMcpTool, isMcpAlive } from "../mcp/client.js";
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

      // Re-run tests after fixing to validate the fix
      logger.info(`[AgentTestsReviewer] Re-running tests after fix: ${testFilename}`);
      const newTestResult = this.taskContext.runner.run(testFilename);
      state.testResult = newTestResult;

      if (newTestResult.success) {
        logger.success(`[AgentTestsReviewer] Tests now passing: ${newTestResult.passed}/${newTestResult.total}`);
      } else {
        logger.warn(`[AgentTestsReviewer] Tests still failing after fix: ${newTestResult.passed} passed, ${newTestResult.failed} failed`);
        if (newTestResult.errors.length > 0) {
          for (let i = 0; i < newTestResult.errors.length; i++) {
            logger.error(`  ${i + 1}. ${newTestResult.errors[i].slice(0, 300)}`);
          }
        }
      }

      this.recordStep("review_fix", `Fixed ${testFilename} (attempt ${state.retries}), re-run: ${newTestResult.success ? "passed" : "failed"}`, "next");

      // Self-reflect on the fix quality
      const reflectionOutput = `Fixed test: ${testFilename}\nAttempt: ${state.retries}\nResult: ${newTestResult.success ? "PASSING" : "FAILING"}\nErrors remaining: ${newTestResult.errors.length}`;
      const reflection = await this.reflect(reflectionOutput);
      this.recordReflection(reflection, state);

      if (reflection.shouldRevise) {
        logger.warn(`[AgentTestsReviewer] Reflection suggests revision (score: ${reflection.score}): ${reflection.weaknesses.join(", ")}`);
      }

      this.updateStatus(AGENT_STATUS.COMPLETED);
    } catch (err) {
      logger.error(`[AgentTestsReviewer] Test review failed: ${err}`);
      state.error = `Test review failed: ${err}`;
      this.updateStatus(AGENT_STATUS.FAILED);
    }

    this.sendMessage(CORE_AGENT_NAMES.SUPERVISOR, MESSAGE_TYPE.NOTIFICATION, {
      event: AGENT_EVENT.TESTS_REVIEWED,
      filename: testFilename,
      attempt: state.retries,
      errorsFixed: testResult?.errors?.length ?? 0,
    });

    return state;
  }

  private async debugAppWithMcp(testContent?: string): Promise<string> {
    const debugInfo: string[] = [];
    
    if (!isMcpAlive()) {
      logger.info(`[AgentTestsReviewer] MCP server not running — skipping live app debug`);
      return "";
    }
    
    try {
      // Use API_BASE_URL from .env (via state) instead of hardcoding
      const baseUrl = this.state.apiBaseUrl || "http://localhost:3000";
      
      // Extract target URL from test code
      let targetUrl = baseUrl;
      if (testContent) {
        const gotoMatch = testContent.match(/page\.goto\(['"](.*?)['"]\)/);
        if (gotoMatch) {
          // Handle relative URLs by prepending base URL
          const url = gotoMatch[1];
          if (url.startsWith("/")) {
            targetUrl = `${baseUrl}${url}`;
          } else if (url.startsWith("http")) {
            targetUrl = url;
          }
        }
      }
      
      // Navigate to the app
      logger.info(`[AgentTestsReviewer] Debugging app with Playwright MCP at ${targetUrl}...`);
      const navResult = await callMcpTool("browser_navigate", { url: targetUrl });
      if (navResult.startsWith("Error:")) {
        logger.warn(`[AgentTestsReviewer] MCP navigation failed — skipping remaining debug calls`);
        debugInfo.push(`Navigation: ${navResult}`);
        return debugInfo.join("\n\n");
      }
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
      
      // Get page snapshot (DOM structure) - increased from 1000 to 5000 chars
      const snapshotResult = await callMcpTool("browser_snapshot", {});
      debugInfo.push(`DOM Snapshot: ${snapshotResult.slice(0, 5000)}`);
      
      logger.info(`[AgentTestsReviewer] MCP debug complete`);
    } catch (err) {
      logger.warn(`[AgentTestsReviewer] MCP debug failed: ${err}`);
      debugInfo.push(`MCP Error: ${err}`);
    }
    
    return debugInfo.join("\n\n");
  }

  private async exploreSourceFiles(testContent: string): Promise<string> {
    const sourceInfo: string[] = [];
    const reader = this.taskContext.reader;

    try {
      // Extract page.goto() URLs to find relevant source files
      const gotoMatches = [...testContent.matchAll(/page\.goto\(['"](.*?)['"]\)/g)];
      const urlToFilePath = (url: string): string | null => {
        if (!url.startsWith("/")) return null;
        const segments = url.split("/").filter(Boolean);
        if (segments.length === 0) return null;
        // Map URL path to Next.js app directory structure
        return `app/${segments.join("/")}/page.tsx`;
      };

      const filePaths = new Set<string>();
      for (const match of gotoMatches) {
        const filePath = urlToFilePath(match[1]);
        if (filePath) filePaths.add(filePath);
      }

      // Also extract describe block names that might hint at feature areas
      const describeMatches = [...testContent.matchAll(/describe\(['"](.*?)['"]/g)];
      for (const match of describeMatches) {
        const name = match[1].toLowerCase().replace(/\s+/g, "-");
        // Try common paths
        const candidates = [
          `app/${name}/page.tsx`,
          `app/admin/${name}/page.tsx`,
          `app/client/${name}/page.tsx`,
          `src/services/${name}.ts`,
        ];
        for (const c of candidates) {
          if (reader.readFile(c) && !reader.readFile(c).startsWith("Error")) {
            filePaths.add(c);
          }
        }
      }

      for (const filePath of [...filePaths].slice(0, 3)) {
        const content = reader.readFile(filePath);
        if (content && !content.startsWith("Error")) {
          sourceInfo.push(`--- ${filePath} ---\n${content.slice(0, 2000)}`);
        }
      }
    } catch (err) {
      logger.warn(`[AgentTestsReviewer] Source file exploration failed: ${err}`);
    }

    return sourceInfo.join("\n\n");
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
      mcpDebugInfo = await this.debugAppWithMcp(testContent);
    } catch (err) {
      logger.warn(`[AgentTestsReviewer] MCP debug skipped: ${err}`);
    }

    // Read source files referenced in the test
    let sourceFileInfo = "";
    try {
      sourceFileInfo = await this.exploreSourceFiles(testContent);
    } catch (err) {
      logger.warn(`[AgentTestsReviewer] Source file exploration skipped: ${err}`);
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
${sourceFileInfo ? `Source Files Context:\n${sourceFileInfo}\n` : ""}
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
    
    logger.task(AGENT_NAMES.AGENT_TESTS_REVIEWER, `${getTaskProviderName(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_TESTS_REVIEWER, this.state.agentConfig)}`);

    const systemPrompt = AgentTestsReviewer.buildSystemPrompt();
    const tools = this.getAvailableTools();

    const userMessage = `Fix the test based on this analysis:\n\n${analysis}\n\nTest file: ${testFilename}\nCurrent content:\n${testContent}\n\nErrors:\n${testResult.errors.join("\n\n")}\n\nUse write_test_file to save the fixed test.`;

    await this.runToolLoop({
      systemPrompt,
      userMessage,
      tools,
      agentName: AGENT_NAMES.AGENT_TESTS_REVIEWER,
    });
  }

  protected getAvailableTools(): ToolDefinition[] {
    return createAgentTools(this.taskContext.reader, this.taskContext.runner, this.taskContext.codebasePath);
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    return executeTool(name, input, this.taskContext.reader, this.taskContext.runner, this.taskContext.testOutputPath, this.taskContext.codebasePath);
  }
}