import type { ProviderInterface, ContentBlock } from "../providers/types.js";
import type { AgentState, AgentName, ReflectionResult } from "./state.js";
import { BaseAgent } from "./base_agent.js";
import { logger } from "../utils/logger.js";
import { AGENT_STATUS, RISK_LEVEL, CORE_AGENT_NAMES } from "../utils/constants.js";

export interface CriticConfig {
  enabled: boolean;
  minScore: number;
  maxRevisions: number;
}

export class AgentCritic extends BaseAgent {
  private config: CriticConfig;
  private targetAgent: AgentName;

  constructor(
    state: AgentState,
    taskContext: import("./base_agent.js").TaskContext,
    targetAgent: AgentName,
    config: CriticConfig = { enabled: true, minScore: 70, maxRevisions: 2 }
  ) {
    super(CORE_AGENT_NAMES.CRITIC, state, AgentCritic.buildSystemPrompt(targetAgent), taskContext);
    this.config = config;
    this.targetAgent = targetAgent;
  }

  static buildSystemPrompt(targetAgent: AgentName): string {
    return `You are a critic evaluating the output of the ${targetAgent} agent.
Your role is to provide harsh but fair feedback to improve quality.

Evaluation criteria:
1. CORRECTNESS - Does the output achieve the stated goal?
2. COMPLETENESS - Are there missing pieces or edge cases?
3. QUALITY - Code style, test coverage, best practices, maintainability
4. ALIGNMENT - Does it follow project conventions and patterns?
5. SAFETY - Any security issues, data leaks, or dangerous operations?

Score 0-100. Below ${70} requires revision.
Output ONLY valid JSON.`;
  }

  getGoal(): string {
    return `Critique the output of ${this.targetAgent} agent`;
  }

  getDefaultPlan(): import("./state.js").AgentPlan {
    return {
      agent: CORE_AGENT_NAMES.CRITIC,
      goal: this.getGoal(),
      steps: [],
      estimatedIterations: 1,
      riskLevel: RISK_LEVEL.LOW,
      createdAt: Date.now(),
    };
  }

  async run(): Promise<AgentState> {
    // Critic is used via critique() and critiqueWithRevision() methods, not run()
    // This override prevents the base class from trying to execute tools
    logger.debug(`[AgentCritic] run() called - critic uses critique() method instead`);
    this.updateStatus(AGENT_STATUS.COMPLETED);
    return this.state;
  }

  async critique(output: string, context: { goal: string; agent: AgentName; projectContext?: AgentState["projectContext"] }): Promise<ReflectionResult> {
    if (!this.config.enabled) {
      return { score: 100, strengths: ["Critic disabled"], weaknesses: [], suggestions: [], shouldRevise: false };
    }

    // Use tools to verify the output before critiquing
    let verificationInfo = "";
    try {
      verificationInfo = await this.verifyOutput(output, context);
    } catch (err) {
      logger.warn(`[AgentCritic] Verification failed: ${err}`);
    }

    const prompt = `Evaluate this agent output:

TARGET AGENT: ${this.targetAgent}
AGENT GOAL: ${context.goal}
PROJECT: ${context.projectContext?.framework || "unknown"} / ${context.projectContext?.testRunner || "unknown"}

OUTPUT TO EVALUATE:
${output.slice(0, 8000)}

${verificationInfo ? `\nVERIFICATION RESULTS:\n${verificationInfo}\n` : ""}

Return ONLY valid JSON:
{
  "score": 0-100,
  "strengths": ["specific strengths"],
  "weaknesses": ["specific weaknesses"],
  "suggestions": ["actionable improvements"],
  "shouldRevise": true/false,
  "revisedOutput": "complete revised version if shouldRevise, else null"
}`;

    try {
      const response = await this.taskContext.provider.chat({
        system: this.systemPrompt,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 4096,
        temperature: 0.1,
      });

      const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
      const raw = textBlocks.map((b) => b.text).join("\n");
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as ReflectionResult;
        result.score = Math.max(0, Math.min(100, result.score));
        return result;
      }
    } catch (err) {
      logger.warn(`[AgentCritic] Evaluation failed for ${this.targetAgent}: ${err}`);
    }

    return {
      score: 75,
      strengths: ["Evaluation unavailable"],
      weaknesses: ["Could not run critic"],
      suggestions: ["Enable critic for quality assurance"],
      shouldRevise: false,
    };
  }

  async critiqueWithRevision(output: string, context: { goal: string; agent: AgentName }): Promise<{ result: ReflectionResult; revised?: string }> {
    let currentOutput = output;
    let bestOutput = output;
    let bestScore = 0;
    let revisions = 0;

    while (revisions < this.config.maxRevisions) {
      const result = await this.critique(currentOutput, context);
      
      this.recordReflection(result);
      
      // Track the best output we've seen
      if (result.score > bestScore) {
        bestScore = result.score;
        bestOutput = currentOutput;
      }

      if (!result.shouldRevise || result.score >= this.config.minScore) {
        // Verify the output before accepting
        const verified = await this.verifyRevisedOutput(currentOutput, context);
        if (verified) {
          return { result, revised: currentOutput };
        }
        logger.warn(`[AgentCritic] Revision scored ${result.score} but failed verification, continuing...`);
      }

      if (result.revisedOutput) {
        currentOutput = result.revisedOutput;
        revisions++;
        logger.info(`[AgentCritic] Revision ${revisions}/${this.config.maxRevisions} for ${this.targetAgent} (score: ${result.score})`);
      } else {
        break;
      }
    }

    // Final verification on the last output
    const finalResult = await this.critique(currentOutput, context);
    const verified = await this.verifyRevisedOutput(currentOutput, context);
    
    if (verified && finalResult.score >= bestScore) {
      return { result: finalResult, revised: currentOutput };
    }
    
    // Fall back to best output if revision didn't improve things
    if (bestScore > finalResult.score) {
      return { result: finalResult, revised: bestOutput };
    }

    return { result: finalResult, revised: undefined };
  }

  private async verifyRevisedOutput(output: string, context: { goal: string; agent: AgentName }): Promise<boolean> {
    // For test files, verify the output is syntactically valid
    if (output.includes("test(") || output.includes("test.describe(")) {
      const hasImports = output.includes("import ");
      const hasTests = (output.match(/test\(/g) || []).length > 0;
      const hasExpect = output.includes("expect(");
      const hasDescribe = output.includes("test.describe(");
      
      if (!hasImports) {
        logger.warn(`[AgentCritic] Revised test missing imports`);
        return false;
      }
      if (!hasTests) {
        logger.warn(`[AgentCritic] Revised test has no test() calls`);
        return false;
      }
      if (!hasExpect) {
        logger.warn(`[AgentCritic] Revised test has no assertions`);
        return false;
      }
      if (!hasDescribe) {
        logger.warn(`[AgentCritic] Revised test missing describe block`);
        return false;
      }

      // Check for TypeScript syntax errors (basic)
      const openBraces = (output.match(/{/g) || []).length;
      const closeBraces = (output.match(/}/g) || []).length;
      if (Math.abs(openBraces - closeBraces) > 2) {
        logger.warn(`[AgentCritic] Revised test has mismatched braces (${openBraces} open, ${closeBraces} close)`);
        return false;
      }
    }

    // For reports, check structure
    if (output.includes("## ")) {
      const sections = output.match(/^## .+$/gm) || [];
      if (sections.length < 2) {
        logger.warn(`[AgentCritic] Revised report has too few sections (${sections.length})`);
        return false;
      }
    }

    // For summaries, check length
    if (output.length < 50) {
      logger.warn(`[AgentCritic] Revised output too short (${output.length} chars)`);
      return false;
    }

    return true;
  }

  private async verifyOutput(output: string, context: { goal: string; agent: AgentName }): Promise<string> {
    const verification: string[] = [];

    // If output looks like a test file, verify it exists and has structure
    if (output.includes("test(") || output.includes("test.describe(")) {
      const testFilename = this.state.testFilename;
      if (testFilename) {
        const testFile = `${this.state.testOutputPath}/${testFilename}`;
        try {
          const content = this.taskContext.reader.readFile(testFile);
          if (content && !content.startsWith("Error")) {
            const lines = content.split("\n");
            const testCount = lines.filter(l => l.includes("test(")).length;
            const describeCount = lines.filter(l => l.includes("test.describe(")).length;
            const importCount = lines.filter(l => l.startsWith("import ")).length;
            verification.push(`Test file exists: ${testCount} tests, ${describeCount} describes, ${importCount} imports`);

            // Check for common issues
            if (testCount === 0) verification.push("WARNING: No test() calls found");
            if (importCount === 0) verification.push("WARNING: No imports found");
            if (!content.includes("expect(")) verification.push("WARNING: No assertions (expect) found");
          } else {
            verification.push(`Test file not readable: ${testFile}`);
          }
        } catch (err) {
          verification.push(`Test file check failed: ${err}`);
        }
      }
    }

    // If output looks like a report, check for completeness
    if (output.includes("## ") || output.includes("# ")) {
      const sections = output.match(/^## .+$/gm) || [];
      verification.push(`Report has ${sections.length} sections: ${sections.join(", ")}`);
    }

    // If output looks like a summary, check length and content
    if (output.length < 100) {
      verification.push("WARNING: Output is very short, may be incomplete");
    }

    return verification.join("\n");
  }
}

export function createCriticForAgent(
  agentName: AgentName,
  state: AgentState,
  taskContext: import("./base_agent.js").TaskContext
): AgentCritic {
  return new AgentCritic(state, taskContext, agentName, {
    enabled: true,
    minScore: 70,
    maxRevisions: 2,
  });
}