import type { AgentState, PlanStep } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { GitBranch } from "../github/git_operations.js";
import { logger } from "../utils/logger.js";
import * as path from "node:path";
import * as fs from "node:fs";
import { toSharedContext } from "../core/adapters.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
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
1. Read relevant source files to understand implementation
2. Write a complete Playwright test file
3. Save it using the write_test_file tool

Follow existing test patterns in the project. Use the project's test utilities.
Write one test case per scenario from the analysis.
Return ONLY the test file content - the tool handles saving.`;
  }

  getGoal(): string {
    if (this.state.mode === "issue" && this.state.issue) {
      return `Generate Playwright tests for issue #${this.state.issue.number}: ${this.state.issue.title}`;
    } else if (this.state.mode === "commit" && this.state.commitDiff) {
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
    if (this.state.mode === "issue" && this.state.issue) {
      testFilename = `issue-${this.state.issue.number}-${GitBranch.slugify(this.state.issue.title)}.spec.ts`;
    } else if (this.state.mode === "commit" && this.state.commitDiff) {
      testFilename = `commit-${this.state.commitDiff.sha.slice(0, 7)}.spec.ts`;
    }

    if (this.state.mode === "issue" && this.state.issueAnalysis) {
      steps.push({
        id: "generate_tests",
        tool: "write_test_file",
        args: { filename: testFilename, content: "" } as Record<string, unknown>,
        expectedOutcome: "Complete test file with all scenarios",
        reasoning: "Generate tests based on issue analysis scenarios",
      });
    } else if (this.state.mode === "commit" && this.state.commitDiff) {
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
      riskLevel: "medium",
      createdAt: Date.now(),
    };
  }

  async run(): Promise<AgentState> {
    if (!this.state.projectContext) {
      this.state.error = "Project context not available";
      this.updateStatus("failed");
      return this.state;
    }

    let testFilename: string;
    if (this.state.mode === "issue" && this.state.issue) {
      testFilename = `issue-${this.state.issue.number}-${GitBranch.slugify(this.state.issue.title)}.spec.ts`;
    } else if (this.state.mode === "commit" && this.state.commitDiff) {
      testFilename = `commit-${this.state.commitDiff.sha.slice(0, 7)}.spec.ts`;
    } else {
      this.state.error = "Cannot determine test filename";
      this.updateStatus("failed");
      return this.state;
    }

    this.state.testFilename = testFilename;

    let userMessage: string;
    if (this.state.mode === "issue" && this.state.issue && this.state.issueAnalysis) {
      const scenarios = this.state.issueAnalysis.test_scenarios
        .map((s, i) => `${i + 1}. ${s.name} (${s.type}): ${s.description}${s.acceptance_criterion ? ` [criteria: ${s.acceptance_criterion}]` : ""}`)
        .join("\n");

      userMessage = `Write a Playwright E2E test file for this issue.

Issue #${this.state.issue.number}: ${this.state.issue.title}
${this.state.issue.body ?? ""}

TEST SCENARIOS (write one test case per scenario):
${scenarios || "(no scenarios — generate based on the issue)"}

Use read_file/list_directory to explore source files as needed.
Use the write_test_file tool to save the test as "${testFilename}".`;
    } else if (this.state.mode === "commit" && this.state.commitDiff) {
      const diff = this.state.commitDiff;
      const shortSha = diff.sha.slice(0, 7);
      const changedFiles = diff.files.map((f) => `  ${f.filename} (${f.status})`).join("\n");

      userMessage = `Write a Playwright E2E test file for this commit.

Commit ${shortSha}: ${diff.message}
Scope: ${this.state.commitAnalysis?.scope ?? "General E2E testing"}

Files changed:
${changedFiles}

Use read_file/list_directory to explore source files as needed.
Use the write_test_file tool to save the test as "${testFilename}".`;
    } else {
      this.state.error = "No analysis data available for test generation";
      this.updateStatus("failed");
      return this.state;
    }

    logger.info(`[AgentTestsGenerator] Generating test: ${testFilename}`);

    try {
      await this.runGeneration(userMessage);

      const testFile = path.join(this.state.testOutputPath, testFilename);
      if (fs.existsSync(testFile)) {
        this.state.testContent = fs.readFileSync(testFile, "utf-8");
      }

      this.recordStep("generate_tests", `Generated ${testFilename}`, "next");
      this.updateStatus("completed");
    } catch (err) {
      this.state.error = `Test generation failed: ${err}`;
      this.updateStatus("failed");
    }

    return this.state;
  }

  private async runGeneration(userMessage: string): Promise<void> {
    const provider = getTaskProvider(AGENT_NAMES.AGENT_TESTS_GENERATOR, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_TESTS_GENERATOR, `${getTaskProviderName(AGENT_NAMES.AGENT_TESTS_GENERATOR, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_TESTS_GENERATOR, this.state.agentConfig)}`);

    const systemPrompt = AgentTestsGenerator.buildSystemPrompt();
    const sharedContext = toSharedContext(this.state);

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: this.getAvailableTools(),
      maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_GENERATOR]?.maxTokens,
      temperature: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_GENERATOR]?.temperature,
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