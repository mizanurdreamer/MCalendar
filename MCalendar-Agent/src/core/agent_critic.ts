import type { ProviderInterface } from "../providers/types.js";
import type { AgentState, AgentName, ReflectionResult } from "./state.js";
import { BaseAgent } from "./base_agent.js";
import { logger } from "../utils/logger.js";

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
    super("critic", state, AgentCritic.buildSystemPrompt(targetAgent), taskContext);
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
      agent: "critic",
      goal: this.getGoal(),
      steps: [],
      estimatedIterations: 1,
      riskLevel: "low",
      createdAt: Date.now(),
    };
  }

  async critique(output: string, context: { goal: string; agent: AgentName; projectContext?: AgentState["projectContext"] }): Promise<ReflectionResult> {
    if (!this.config.enabled) {
      return { score: 100, strengths: ["Critic disabled"], weaknesses: [], suggestions: [], shouldRevise: false };
    }

    const prompt = `Evaluate this agent output:

TARGET AGENT: ${this.targetAgent}
AGENT GOAL: ${context.goal}
PROJECT: ${context.projectContext?.framework || "unknown"} / ${context.projectContext?.testRunner || "unknown"}

OUTPUT TO EVALUATE:
${output.slice(0, 8000)}

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
    let revisions = 0;

    while (revisions < this.config.maxRevisions) {
      const result = await this.critique(currentOutput, context);
      
      this.recordReflection(result);
      
      if (!result.shouldRevise || result.score >= this.config.minScore) {
        return { result, revised: result.revisedOutput };
      }

      if (result.revisedOutput) {
        currentOutput = result.revisedOutput;
        revisions++;
        logger.info(`[AgentCritic] Revision ${revisions}/${this.config.maxRevisions} for ${this.targetAgent}`);
      } else {
        break;
      }
    }

    return { result: await this.critique(currentOutput, context), revised: currentOutput };
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