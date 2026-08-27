import type { AgentState } from "../core/state.js";
import { BaseAgent } from "../core/base_agent.js";
import { logger } from "../utils/logger.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { toSharedContext } from "../core/adapters.js";

export class AgentTestsReportGenerator extends BaseAgent {
  constructor(state: AgentState, taskContext: import("../core/base_agent.js").TaskContext) {
    super(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, state, AgentTestsReportGenerator.buildSystemPrompt(), taskContext);
  }

  static buildSystemPrompt(): string {
    return `You are the Test Report Generator agent. Your job is to create a comprehensive test report.

Given test results, generate a detailed markdown report including:
1. Executive summary
2. Test results breakdown (passed/failed/skipped)
3. Failure analysis with root causes
4. Coverage information
5. Recommendations

Output a well-structured markdown report.`;
  }

  getGoal(): string {
    return `Generate test report for ${this.state.testFilename}`;
  }

  getDefaultPlan(): import("../core/state.js").AgentPlan {
    return {
      agent: AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR,
      goal: this.getGoal(),
      steps: [
        {
          id: "generate_report",
          tool: "generate_report",
          args: {},
          expectedOutcome: "Complete markdown test report",
          reasoning: "Generate comprehensive report from test results",
        },
      ],
      estimatedIterations: 1,
      riskLevel: "low",
      createdAt: Date.now(),
    };
  }

  async run(): Promise<AgentState> {
    if (!this.state.testResult) {
      logger.info(`[AgentTestsReportGenerator] No test results to report`);
      this.updateStatus("completed");
      return this.state;
    }

    try {
      const output = await this.runReportGeneration();

      this.state.report = output;
      this.state.reportPath = this.saveReportFile(output);

      this.recordStep("generate_report", "Report generated", "next");
      this.updateStatus("completed");
    } catch (err) {
      this.state.error = `Report generation failed: ${err}`;
      this.updateStatus("failed");
    }

    return this.state;
  }

  private async runReportGeneration(): Promise<string> {
    const provider = getTaskProvider(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, this.state.agentConfig);
    logger.task(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, `${getTaskProviderName(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, this.state.agentConfig)}/${getTaskModel(AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, this.state.agentConfig)}`);

    const systemPrompt = AgentTestsReportGenerator.buildSystemPrompt();
    const sharedContext = toSharedContext(this.state);

    const testResult = this.state.testResult!;
    const userMessage = `Generate a comprehensive test report for: ${this.state.testFilename}

Test Results:
- Passed: ${testResult.passed}
- Failed: ${testResult.failed}
- Total: ${testResult.total}
- Success: ${testResult.success}

Errors:
${testResult.errors.join("\n")}

Test Output:
${testResult.output}

HTML Report: ${testResult.htmlReportPath || "N/A"}

Generate a comprehensive markdown report with:
1. Executive Summary
2. Test Results Breakdown
3. Failure Analysis with Root Causes
4. Recommendations`;

    const response = await provider.chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR]?.maxTokens,
      temperature: this.state.agentConfig[AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR]?.temperature,
    });

    const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
    return textBlocks.map((b) => b.text).join("\n");
  }

  private saveReportFile(report: string): string | undefined {
    try {
      const reportsDir = path.resolve("reports");
      if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

      const date = new Date().toISOString().slice(0, 10);
      let filename: string;
      if (this.state.mode === "issue" && this.state.issue) {
        filename = `issue-${this.state.issue.number}-${date}.md`;
      } else if (this.state.mode === "commit" && this.state.commitDiff) {
        filename = `commit-${this.state.commitDiff.sha.slice(0, 7)}-${date}.md`;
      } else {
        filename = `report-${date}-${Date.now()}.md`;
      }

      const filePath = path.join(reportsDir, filename);
      const htmlPath = this.state.testResult?.htmlReportPath;
      const htmlNote = htmlPath
        ? `\n\n---\n*Playwright HTML report: \`${htmlPath}\` — view with \`npx playwright show-report\` from the test project.*`
        : "";
      fs.writeFileSync(filePath, `# Test Report — ${new Date().toISOString()}\n\n${report}${htmlNote}\n`, "utf-8");
      logger.success(`[AgentTestsReportGenerator] Report saved to ${filePath}`);
      return filePath;
    } catch (err) {
      logger.warn(`[AgentTestsReportGenerator] Failed to save report file: ${err}`);
      return undefined;
    }
  }
}