import type { AgentState, AgentPlan } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import * as path from "node:path";
import * as fs from "node:fs";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { AGENT_STATUS, PIPELINE_STATUS, MODE, RISK_LEVEL, MESSAGE_TYPE, AGENT_EVENT, CORE_AGENT_NAMES } from "../utils/constants.js";
import { getToolRegistry } from "../core/tool_registry.js";
import type { ToolDefinition } from "../providers/types.js";

export class AgentCodeFixer extends BaseAgent {
  constructor(state: AgentState, taskContext: import("../core/base_agent.js").TaskContext) {
    super(AGENT_NAMES.AGENT_CODE_FIXER, state, AgentCodeFixer.buildSystemPrompt(), taskContext);
  }

  static buildSystemPrompt(): string {
    return `You are the Code Fixer agent. Your job is to fix bugs in the TARGET PROJECT's source code (the application under test), NOT the test files.

You will receive:
- Test failure analysis identifying root causes in the application source
- The specific source files that need fixing
- Access to read and write source files

Your task:
1. Read the failing source files to understand the bug
2. Fix the bug in the application source code
3. Use the write_source_file tool to save your fixes
4. Do NOT modify test files - only fix the application source

Focus on:
- Logic errors in the application code
- Missing or incorrect validation
- Database/query issues
- Routing or API issues
- UI/UX bugs causing test failures

Use all available tools to investigate and fix the source code. Return the fixed source via write_source_file tool.`;
  }

  getGoal(): string {
    return `Fix target project source code for ${this.state.testFilename} (attempt ${this.state.retries + 1})`;
  }

  getDefaultPlan(): AgentPlan {
    return {
      agent: AGENT_NAMES.AGENT_CODE_FIXER,
      goal: this.getGoal(),
      steps: [
        {
          id: "analyze_source",
          tool: "read_file",
          args: {},
          expectedOutcome: "Understand the buggy source code",
          reasoning: "Read the source files referenced in the test failure analysis",
        },
        {
          id: "fix_source",
          tool: "write_source_file",
          args: { path: "", content: "" },
          expectedOutcome: "Fixed source file that resolves the test failure",
          reasoning: "Apply the fix to the application source code",
          dependsOn: ["analyze_source"],
        },
      ],
      estimatedIterations: 3,
      riskLevel: RISK_LEVEL.MEDIUM,
      createdAt: Date.now(),
    };
  }

  async run(inputState?: AgentState): Promise<AgentState> {
    const state = inputState || this.state;
    const targetIssues = state.targetCodeIssues;

    if (!targetIssues || targetIssues.length === 0) {
      logger.info(`[AgentCodeFixer] No target code issues to fix`);
      this.updateStatus(AGENT_STATUS.COMPLETED);
      return state;
    }

    logger.info(`[AgentCodeFixer] Fixing ${targetIssues.length} target code issue(s)`);

    try {
      const issuesText = targetIssues.map((issue, i) =>
        `${i + 1}. File: ${issue.file}\n   Issue: ${issue.issue}\n   Fix: ${issue.fix}`
      ).join("\n\n");

      const userMessage = `Fix the following bugs in the target project source code:

${issuesText}

Test file: ${state.testFilename}
Test errors: ${state.testResult?.errors?.join("\n\n") ?? "N/A"}

Read the source files using read_file, fix the bugs, and use write_source_file to save the fixed files.`;

      await this.runFix(userMessage);

      for (const issue of targetIssues) {
        const fullPath = path.join(state.codebasePath, issue.file);
        if (fs.existsSync(fullPath)) {
          logger.info(`[AgentCodeFixer] Fixed source file: ${issue.file}`);
        }
      }

      this.recordStep("fix_source", `Fixed ${targetIssues.length} source file(s)`, "next");
      this.updateStatus(AGENT_STATUS.COMPLETED);

      this.sendMessage(CORE_AGENT_NAMES.SUPERVISOR, MESSAGE_TYPE.NOTIFICATION, {
        event: AGENT_EVENT.CODE_FIXED,
        filename: state.testFilename,
        filesFixed: targetIssues.length,
      });

      state.targetCodeIssues = [];
    } catch (err) {
      logger.error(`[AgentCodeFixer] Code fix failed: ${err}`);
      state.error = `Code fix failed: ${err}`;
      this.updateStatus(AGENT_STATUS.FAILED);
    }

    this.sendMessage(CORE_AGENT_NAMES.SUPERVISOR, MESSAGE_TYPE.NOTIFICATION, {
      event: AGENT_EVENT.CODE_FIXED,
      filename: state.testFilename,
      filesFixed: targetIssues.length,
    });

    return state;
  }

  private async runFix(userMessage: string): Promise<void> {
    logger.task(AGENT_NAMES.AGENT_CODE_FIXER, `${getTaskProviderName(AGENT_NAMES.AGENT_CODE_FIXER, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_CODE_FIXER, this.state.agentConfig)}`);

    const systemPrompt = AgentCodeFixer.buildSystemPrompt();
    const tools = this.getAvailableTools();

    await this.runToolLoop({
      systemPrompt,
      userMessage,
      tools,
      agentName: AGENT_NAMES.AGENT_CODE_FIXER,
    });
  }

  protected getAvailableTools(): ToolDefinition[] {
    return getToolRegistry().getByRole("code_fixer");
  }
}
