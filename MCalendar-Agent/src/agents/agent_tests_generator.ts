import type { AgentState, PlanStep } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { GitBranch } from "../github/git_operations.js";
import { logger } from "../utils/logger.js";
import * as path from "node:path";
import * as fs from "node:fs";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL, MESSAGE_TYPE, AGENT_EVENT, CORE_AGENT_NAMES } from "../utils/constants.js";
import { createAgentTools, executeTool } from "../utils/tools.js";
import type { ToolDefinition } from "../providers/types.js";

export class AgentTestsGenerator extends BaseAgent {
  constructor(state: AgentState, taskContext: import("../core/base_agent.js").TaskContext) {
    super(AGENT_NAMES.AGENT_TESTS_GENERATOR, state, AgentTestsGenerator.buildSystemPrompt(), taskContext);
  }

  static buildSystemPrompt(): string {
    return `You are the Test Generator agent. Your job is to write Playwright E2E test files based on analysis.

You will receive:
- Issue analysis with test scenarios OR commit analysis with scope
- Project context (framework, test runner, existing patterns)
- Access to read files and explore the codebase

Your task:
1. EXPLORE the live app using browser tools to understand the actual DOM structure
2. Read relevant source files to understand implementation
3. Write a complete Playwright test file covering ALL scenarios
4. IMPORTANT: You MUST call the write_test_file tool to save the test file. Do NOT just return the content as text.

CRITICAL: MCP APP EXPLORATION (MANDATORY)
Before writing any test code, you MUST explore the live application:
1. Use browser_navigate to visit the pages you need to test
2. Use browser_snapshot to understand the actual DOM structure (element IDs, classes, labels, data attributes)
3. Use browser_click and browser_type to verify your selectors work
4. Note the real form field names, button labels, and page layout
Do NOT guess selectors from source code — the rendered DOM may differ from React components.
If browser tools are not available, read the HTML source or component files carefully.

AUTH UTILITIES:
The project has auth utilities you MUST use:
- utils/token.ts: signAccessToken() for JWT cookie injection (fast, reliable)
- auth.setup.ts: stored authentication states (admin.json, client.json, attendant.json)
Use JWT cookie injection for authentication instead of UI login flows. It is faster and more reliable.

CRITICAL RULES:
- You MUST write a test case for EVERY SINGLE scenario provided. Do NOT skip any scenario.
- Do NOT summarize, abbreviate, or group scenarios together. Each scenario gets its own test() block.
- If there are many scenarios (15+), use this batching approach:
  1. First call: write_test_file with the file header (imports, describe block) and the first 8-10 test cases
  2. Subsequent calls: append_test_file to add remaining test cases in batches of 8-10
- Do NOT generate empty placeholder tests. Every test must have real assertions.
- Use relative URLs (e.g., '/admin/clients') with baseURL from Playwright config, NOT hardcoded http://localhost:3000.

Follow existing test patterns in the project. Use the project's test utilities.
You MUST use the write_test_file and append_test_file tools to save your test.`;
  }

  getGoal(): string {
    if (this.state.mode === MODE.ISSUE && this.state.issue) {
      return `Generate Playwright tests for issue #${this.state.issue.number}: ${this.state.issue.title}`;
    } else if (this.state.mode === MODE.COMMIT && this.state.commitDiff) {
      return `Generate Playwright tests for commit ${this.state.commitDiff.sha.slice(0,7)}`;
    }
    return "Generate Playwright tests";
  }

  getDefaultPlan(): import("../core/state.js").AgentPlan {
    const steps: PlanStep[] = [
      {
        id: "discover_context",
        tool: "read_file",
        args: { path: "package.json" },
        expectedOutcome: "Understand project dependencies and structure",
        reasoning: "Need project context before generating tests",
      },
    ];

    let testFilename = "test.spec.ts";
    if (this.state.mode === MODE.ISSUE && this.state.issue) {
      testFilename = `issue-${this.state.issue.number}-${GitBranch.slugify(this.state.issue.title)}.spec.ts`;
    } else if (this.state.mode === MODE.COMMIT && this.state.commitDiff) {
      testFilename = `commit-${this.state.commitDiff.sha.slice(0, 7)}.spec.ts`;
    }

    if (this.state.mode === MODE.ISSUE && this.state.issueAnalysis) {
      steps.push({
        id: "generate_tests",
        tool: "write_test_file",
        args: { filename: testFilename, content: "" } as Record<string, unknown>,
        expectedOutcome: "Complete test file with all scenarios",
        reasoning: "Generate tests based on issue analysis scenarios",
      });
    } else if (this.state.mode === MODE.COMMIT && this.state.commitDiff) {
      steps.push({
        id: "generate_tests",
        tool: "write_test_file",
        args: { filename: testFilename, content: "" } as Record<string, unknown>,
        expectedOutcome: "Complete test file for commit changes",
        reasoning: "Generate tests based on commit analysis scope",
      });
    }

    return {
      agent: AGENT_NAMES.AGENT_TESTS_GENERATOR,
      goal: this.getGoal(),
      steps,
      estimatedIterations: 3,
      riskLevel: RISK_LEVEL.MEDIUM,
      createdAt: Date.now(),
    };
  }

  async run(inputState?: AgentState): Promise<AgentState> {
    const state = inputState || this.state;

    // Recall past lessons and test patterns
    const lessons = await this.recallLessons();
    const testPatterns = await this.recallTestPatterns();
    if (lessons || testPatterns) {
      logger.info(`[AgentTestsGenerator] Recalled past lessons and test patterns`);
    }

    let testFilename: string;
    if (state.mode === MODE.ISSUE && state.issue) {
      testFilename = `issue-${state.issue.number}-${GitBranch.slugify(state.issue.title)}.spec.ts`;
    } else if (state.mode === MODE.COMMIT && state.commitDiff) {
      testFilename = `commit-${state.commitDiff.sha.slice(0, 7)}.spec.ts`;
    } else {
      logger.error(`[AgentTestsGenerator] Cannot determine test filename (mode: ${state.mode})`);
      state.error = "Cannot determine test filename";
      this.updateStatus(AGENT_STATUS.FAILED);
      return state;
    }

    state.testFilename = testFilename;

    // RETRY CASE: If reviewer already fixed the test content, write it directly
    if (state.retries > 0 && state.testContent) {
      logger.info(`[AgentTestsGenerator] Retry ${state.retries}: Using fixed test content from reviewer`);
      logger.info(`[AgentTestsGenerator] Previous test file: ${testFilename}`);
      const fullPath = path.join(state.testOutputPath, testFilename);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      // Log what changed between retries
      if (fs.existsSync(fullPath)) {
        const oldContent = fs.readFileSync(fullPath, "utf-8");
        const oldLines = oldContent.split("\n").length;
        const newLines = state.testContent.split("\n").length;
        logger.info(`[AgentTestsGenerator] Content change: ${oldLines} → ${newLines} lines`);
      }
      
      fs.writeFileSync(fullPath, state.testContent, "utf-8");
      logger.success(`[AgentTestsGenerator] Fixed test file written: tests/${testFilename}`);
      
      this.recordStep("generate_tests", `Wrote fixed tests: ${testFilename}`, "next");
      this.updateStatus(AGENT_STATUS.COMPLETED);
      return state;
    }

    let userMessage: string;
    if (state.mode === MODE.ISSUE && state.issue && state.issueAnalysis) {
      const scenarios = state.issueAnalysis.test_scenarios
        .map((s, i) => `${i + 1}. ${s.name} (${s.type}): ${s.description}${s.acceptance_criterion ? ` [criteria: ${s.acceptance_criterion}]` : ""}`)
        .join("\n");

      userMessage = `Write a Playwright E2E test file for this issue.

Issue #${state.issue.number}: ${state.issue.title}
${state.issue.body ?? ""}

TEST SCENARIOS (write one test case per scenario):
${scenarios || "(no scenarios — generate based on the issue)"}

${lessons ? `\n${lessons}\n` : ""}
${testPatterns ? `\n${testPatterns}\n` : ""}
Use read_file/list_directory to explore source files as needed.
Use the write_test_file tool to save the test as "${testFilename}".`;
    } else if (state.mode === MODE.COMMIT && state.commitDiff) {
      const diff = state.commitDiff;
      const shortSha = diff.sha.slice(0, 7);
      const changedFiles = diff.files.map((f) => `  ${f.filename} (${f.status})`).join("\n");

      logger.info(`[AgentTestsGenerator] Commit mode: ${shortSha}`);
      logger.info(`  Scope: ${state.commitAnalysis?.scope ?? "General E2E testing"}`);
      logger.info(`  Changed files:`);
      for (const f of diff.files) {
        logger.info(`    - ${f.filename} (${f.status})`);
      }

      userMessage = `Write a Playwright E2E test file for this commit.

Commit ${shortSha}: ${diff.message}
Scope: ${state.commitAnalysis?.scope ?? "General E2E testing"}

Files changed:
${changedFiles}

${lessons ? `\n${lessons}\n` : ""}
${testPatterns ? `\n${testPatterns}\n` : ""}
Use read_file/list_directory to explore source files as needed.
Use the write_test_file tool to save the test as "${testFilename}".`;
    } else {
      logger.error(`[AgentTestsGenerator] No analysis data available (mode: ${state.mode})`);
      state.error = "No analysis data available for test generation";
      this.updateStatus(AGENT_STATUS.FAILED);
      return state;
    }

    logger.info(`[AgentTestsGenerator] Generating test: ${testFilename}`);
    
    // Log scenarios used for generation
    if (state.mode === MODE.ISSUE && state.issueAnalysis?.test_scenarios) {
      logger.info(`  Scenarios to generate tests for:`);
      for (const s of state.issueAnalysis.test_scenarios) {
        logger.info(`    - ${s.name} (${s.type}): ${s.description}`);
      }
    }

    try {
      await this.runGeneration(userMessage);

      // Check if file was created by tool loop, if not try fallback
      let testFile = path.join(state.testOutputPath, testFilename);
      if (!fs.existsSync(testFile)) {
        logger.warn(`[AgentTestsGenerator] Test file not found after tool loop, attempting fallback extraction`);
        await this.fallbackExtractAndWrite(testFilename);
        testFile = path.join(state.testOutputPath, testFilename);
      }

      // If file exists (from tool loop or fallback), process it
      if (fs.existsSync(testFile)) {
        state.testContent = fs.readFileSync(testFile, "utf-8");
        logger.success(`[AgentTestsGenerator] Test file created: tests/${testFilename}`);
        
        // Log all test case names from file
        const lines = state.testContent.split('\n');
        const testNames = lines.filter(l => l.includes('test(') || l.includes('test.only(')).map(l => l.trim());
        if (testNames.length > 0) {
          logger.info(`[AgentTestsGenerator] Test cases in file (${testNames.length} total):`);
          for (let i = 0; i < testNames.length; i++) {
            logger.info(`    ${i + 1}. ${testNames[i]}`);
          }
        }
      } else {
        logger.error(`[AgentTestsGenerator] Failed to create test file: tests/${testFilename}`);
      }

      this.recordStep("generate_tests", `Generated ${testFilename}`, "next");

      // Self-reflect on the generated tests
      if (state.testContent) {
        const reflection = await this.reflect(state.testContent);
        this.recordReflection(reflection, state);

        if (reflection.shouldRevise) {
          logger.warn(`[AgentTestsGenerator] Reflection suggests revision (score: ${reflection.score}): ${reflection.weaknesses.join(", ")}`);
        }
      }

      this.updateStatus(AGENT_STATUS.COMPLETED);
    } catch (err) {
      logger.error(`[AgentTestsGenerator] Test generation failed: ${err}`);
      state.error = `Test generation failed: ${err}`;
      this.updateStatus(AGENT_STATUS.FAILED);
    }

    this.sendMessage(CORE_AGENT_NAMES.SUPERVISOR, MESSAGE_TYPE.NOTIFICATION, {
      event: AGENT_EVENT.TESTS_GENERATED,
      filename: testFilename,
    });

    return state;
  }

  private async runGeneration(userMessage: string): Promise<void> {
    logger.task(AGENT_NAMES.AGENT_TESTS_GENERATOR, `${getTaskProviderName(AGENT_NAMES.AGENT_TESTS_GENERATOR, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_TESTS_GENERATOR, this.state.agentConfig)}`);

    const systemPrompt = AgentTestsGenerator.buildSystemPrompt();
    const tools = this.getAvailableTools();
    
    logger.info(`[AgentTestsGenerator] Available tools: ${tools.map(t => t.name).join(', ')}`);
    
    await this.runToolLoop({
      systemPrompt,
      userMessage,
      tools,
      agentName: AGENT_NAMES.AGENT_TESTS_GENERATOR,
    });
  }

  protected getAvailableTools(): ToolDefinition[] {
    return createAgentTools(this.taskContext.reader, this.taskContext.runner, this.taskContext.codebasePath);
  }

  private async executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    return executeTool(name, input, this.taskContext.reader, this.taskContext.runner, this.taskContext.testOutputPath, this.taskContext.codebasePath);
  }

  private async fallbackExtractAndWrite(testFilename: string): Promise<boolean> {
    try {
      // Make one more LLM call asking specifically for the test content
      const provider = getTaskProvider(AGENT_NAMES.AGENT_TESTS_GENERATOR, this.state.agentConfig);
      const response = await provider.chat({
        system: "You must return ONLY the Playwright test file content. No explanations, no markdown fences, just the raw TypeScript test code.",
        messages: [{ role: "user", content: "Write the complete Playwright test file content now. Return ONLY the code." }],
        maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_GENERATOR]?.maxTokens,
        temperature: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_GENERATOR]?.temperature,
      });

      const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
      const text = textBlocks.map(b => b.text).join('\n');
      
      // Try to extract test code from markdown fences or raw text
      let testContent = text;
      const fenceMatch = text.match(/```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/);
      if (fenceMatch) {
        testContent = fenceMatch[1].trim();
      }
      
      // Validate it looks like a test file
      if (testContent.includes('test(') || testContent.includes('test.describe(') || testContent.includes('test.beforeEach(')) {
        const fullPath = path.join(this.state.testOutputPath, testFilename);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, testContent, "utf-8");
        this.state.testContent = testContent;
        logger.success(`[AgentTestsGenerator] Fallback: Test file written via text extraction: tests/${testFilename}`);
        return true;
      }
      
      logger.warn(`[AgentTestsGenerator] Fallback: Extracted text doesn't look like a test file`);
      return false;
    } catch (err) {
      logger.error(`[AgentTestsGenerator] Fallback extraction failed: ${err}`);
      return false;
    }
  }
}