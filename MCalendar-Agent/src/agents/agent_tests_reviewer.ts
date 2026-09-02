import type { AgentState } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL, MESSAGE_TYPE, AGENT_EVENT, CORE_AGENT_NAMES } from "../utils/constants.js";
import { getToolRegistry } from "../core/tool_registry.js";
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

ALL TOOLS AVAILABLE TO YOU:
File & Code:
- read_file: Read any source file
- list_directory: List directory contents
- find_usage: Find where a function/variable is used
- find_definition: Find where a function/variable is defined
- write_test_file: Write a Playwright test file
- append_test_file: Append test cases to existing file

Shell & Dev:
- run_command: Execute any shell command
- npm_command: Run npm scripts
- git_log: View recent git commits
- git_diff: View git diff
- lint_code: Run linter
- check_types: Run TypeScript type checking
- run_playwright_test: Execute Playwright tests

Database:
- database_schema: Query database schema
- query_database: Run SQL queries

Browser:
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

Focus on:
- Selector issues (wrong locators, timing)
- Test logic errors
- Missing setup/teardown
- Data dependencies
- Async/await problems

Use all available tools to debug and fix tests. Return the fixed test file content via write_test_file tool.`;
  }

  getGoal(): string {
    return `Fix failing tests for ${this.state.testFilename} (attempt ${this.state.retries + 1}/${this.state.testReviewMaxRetries})`;
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

    // Recall past error fixes and lessons
    const errorFixes = await this.recallErrorFixes(testResult.errors[0]);
    const lessons = await this.recallLessons();
    if (errorFixes || lessons) {
      logger.info(`[AgentTestsReviewer] Recalled past error fixes and lessons`);
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
      const analysis = await this.runErrorAnalysis(testContent, errorFixes, lessons);

      state.retryHistory.push({
        attempt: state.retries,
        errors: testResult.errors,
        analysis,
      });

      // Log the error analysis result
      logger.info(`[AgentTestsReviewer] Error analysis result:`);
      let parsed: any;
      try {
        parsed = JSON.parse(analysis);
        if (parsed.root_cause) logger.info(`  Root cause: ${parsed.root_cause}`);
        if (parsed.fixes_needed?.length) {
          logger.info(`  Fixes needed:`);
          for (const fix of parsed.fixes_needed) {
            logger.info(`    - [${fix.scope || 'test'}] ${fix.issue} → ${fix.fix}`);
          }
        }
        if (parsed.priority) logger.info(`  Priority: ${parsed.priority}`);
      } catch {
        // If not JSON, log raw analysis
        logger.info(`  Analysis: ${analysis.slice(0, 1000)}`);
      }

      // Separate fixes by scope: test fixes vs target source fixes
      const allFixes = parsed?.fixes_needed ?? [];
      const targetIssues = allFixes.filter((f: any) => f.scope === "target");
      const testFixes = allFixes.filter((f: any) => f.scope !== "target");

      // Store target code issues for the code fixer agent
      if (targetIssues.length > 0) {
        state.targetCodeIssues = targetIssues.map((f: any) => ({
          file: f.file,
          issue: f.issue,
          fix: f.fix,
        }));
        logger.info(`[AgentTestsReviewer] Found ${targetIssues.length} target code issue(s) to route to code fixer`);
      }

      // Apply test-scope fixes only (target fixes are handled by code_fixer)
      if (testFixes.length > 0) {
        const testOnlyAnalysis = JSON.stringify({ ...parsed, fixes_needed: testFixes });
        logger.info(`[AgentTestsReviewer] Applying ${testFixes.length} test fix(es)...`);
        await this.runFix(testContent, testOnlyAnalysis);

        const path = await import("node:path");
        const testFile = path.join(state.testOutputPath, testFilename);
        const fs = await import("node:fs");
        if (fs.existsSync(testFile)) {
          state.testContent = fs.readFileSync(testFile, "utf-8");
          logger.success(`[AgentTestsReviewer] Fix applied to ${testFilename}`);
        }
      }

      // If there are target issues, don't re-run tests yet - let code fixer handle it
      if (targetIssues.length > 0) {
        this.recordStep("review_analyze", `Found ${targetIssues.length} target code issue(s), routing to code fixer`, "next");
        this.updateStatus(AGENT_STATUS.COMPLETED);

        this.sendMessage(CORE_AGENT_NAMES.SUPERVISOR, MESSAGE_TYPE.NOTIFICATION, {
          event: AGENT_EVENT.TESTS_REVIEWED,
          filename: testFilename,
          attempt: state.retries,
          targetIssues: targetIssues.length,
        });
        return state;
      }

      // Re-run tests after fixing (only test-scope fixes)
      logger.info(`[AgentTestsReviewer] Re-running tests after fix: ${testFilename}`);
      const newTestResult = this.taskContext.runner.run(testFilename);
      state.testResult = newTestResult;

      if (newTestResult.success) {
        logger.success(`[AgentTestsReviewer] Tests now passing: ${newTestResult.passed}/${newTestResult.total}`);
        
        // Store successful fix pattern to memory for future recall
        try {
          const parsed = JSON.parse(analysis);
          this.remember({
            type: "error_fix",
            content: JSON.stringify({
              testFilename,
              originalErrors: testResult.errors.slice(0, 3).map(e => e.slice(0, 200)),
              rootCause: parsed.root_cause || "unknown",
              fixesApplied: (parsed.fixes_needed || []).slice(0, 5),
            }),
            metadata: {
              project: state.projectName || "unknown",
              agent: this.agentName,
              success: true,
              tags: ["error_fix", this.agentName, testFilename, "verified"],
              source: "test-reviewer-fix",
            },
          });
        } catch (err) {
          logger.warn(`[AgentTestsReviewer] Failed to store fix pattern: ${err}`);
        }
      } else {
        logger.warn(`[AgentTestsReviewer] Tests still failing after fix: ${newTestResult.passed} passed, ${newTestResult.failed} failed`);
        if (newTestResult.errors.length > 0) {
          for (let i = 0; i < newTestResult.errors.length; i++) {
            logger.error(`  ${i + 1}. ${newTestResult.errors[i].slice(0, 300)}`);
          }
        }
        
        // Send feedback to TestsGenerator for next retry
        this.sendMessage(AGENT_NAMES.AGENT_TESTS_GENERATOR, MESSAGE_TYPE.FEEDBACK, {
          event: "tests_still_failing",
          errors: newTestResult.errors,
          analysis: analysis,
          attempt: state.retries,
        });
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

  private async runErrorAnalysis(testContent: string, errorFixes?: string, lessons?: string): Promise<string> {
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

    const systemPrompt = `You are a test error analyzer. Given a failing test file, its error output, and optionally live app debug info, analyze the root cause.

You have access to all tools to investigate:
- Read source files with read_file to understand the code
- Run commands with run_command to check the environment
- Use browser tools to verify the app state
- Query database with database_schema if needed

When you have finished investigating, call the submit_analysis tool with your findings.

IMPORTANT: For each fix, classify its scope:
- scope="test" if the fix is to the test file itself (wrong selector, wrong assertion, missing setup)
- scope="target" if the fix is to the APPLICATION source code (the bug is in the app, not the test)

Output structure:
{
  "root_cause": "description of the root cause",
  "fixes_needed": [
    {"file": "file path", "issue": "what's wrong", "fix": "how to fix it", "scope": "test|target"}
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
${errorFixes ? `\nPrevious fix attempts:\n${errorFixes}\n` : ""}
${lessons ? `\nPast lessons:\n${lessons}\n` : ""}
${this.taskContext.currentPlanStep ? `\nPlan Context:\n- Step: ${this.taskContext.currentPlanStep.reasoning}\n- Expected Outcome: ${this.taskContext.currentPlanStep.expectedOutcome}\n` : ""}
Use tools to investigate the root cause, then call submit_analysis with your fix plan.`;

    const submitAnalysisTool: ToolDefinition = {
      name: "submit_analysis",
      description: "Submit the error analysis with fix plan",
      inputSchema: {
        type: "object",
        properties: {
          root_cause: { type: "string", description: "Description of the root cause" },
          fixes_needed: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                issue: { type: "string" },
                fix: { type: "string" },
                scope: { type: "string", enum: ["test", "target"], description: "test = fix the test file, target = fix the application source code" },
              },
              required: ["file", "issue", "fix", "scope"],
            },
            description: "List of fixes needed",
          },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["root_cause", "fixes_needed", "priority"],
      },
    };

    const { messages } = await this.runToolLoop({
      systemPrompt,
      userMessage,
      tools: [...this.getAvailableTools(), submitAnalysisTool],
      onToolCall: (toolBlocks) => {
        const submitBlock = toolBlocks.find(t => t.name === "submit_analysis");
        if (submitBlock) {
          return { intercept: true, result: submitBlock.input };
        }
        return { intercept: false };
      },
    });

    // Extract the submit_analysis result from messages
    for (const msg of messages) {
      if (msg.role === "assistant") {
        const toolBlocks = (Array.isArray(msg.content) ? msg.content : [])
          .filter((b) => b.type === "tool_use" && b.name === "submit_analysis") as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }[];
        const submitBlock = toolBlocks.find(t => t.name === "submit_analysis");
        if (submitBlock) {
          return JSON.stringify(submitBlock.input);
        }
      }
    }

    // Fallback: return last assistant text
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    if (lastAssistant) {
      const textBlocks = (Array.isArray(lastAssistant.content) ? lastAssistant.content : [])
        .filter((b): b is { type: "text"; text: string } => b.type === "text");
      return textBlocks.map((b) => b.text).join("\n");
    }

    return "No analysis produced";
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
    return getToolRegistry().getByRole("tests_reviewer");
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    return getToolRegistry().execute(name, input, {
      codebasePath: this.taskContext.codebasePath,
      testOutputPath: this.taskContext.testOutputPath,
      testProjectPath: this.taskContext.testOutputPath,
    });
  }
}