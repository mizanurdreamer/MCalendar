import type { AgentState, AgentName, AgentPlan, PlanStep, ReflectionResult, MemoryEntry } from "./state.js";
import { logger } from "../utils/logger.js";
import type { ProviderInterface } from "../providers/types.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { CORE_AGENT_NAMES, MODE, RISK_LEVEL } from "../utils/constants.js";

export interface PlannerConfig {
  enabled: boolean;
  maxPlanSteps: number;
  allowParallel: boolean;
}

export interface CriticFeedback {
  agent: AgentName;
  score: number;
  weaknesses: string[];
  suggestions: string[];
  shouldRevise: boolean;
  revisedOutput?: string;
}

export class AdvancedPlanner {
  private state: AgentState;
  private config: PlannerConfig;
  private provider?: ProviderInterface;

  constructor(state: AgentState, config: PlannerConfig = { enabled: true, maxPlanSteps: 20, allowParallel: true }) {
    this.state = state;
    this.config = config;
    this.provider = (state as any).provider;
  }

  setProvider(provider: ProviderInterface): void {
    this.provider = provider;
  }

  /**
   * Recall past decisions from memory to inform planning
   */
  private async recallPastDecisions(): Promise<string> {
    if (!this.state.memoryStore) return "";
    
    try {
      const decisions = await this.state.memoryStore.retrieve("decision", ["planning", "strategy"], 3);
      if (decisions.length === 0) return "";
      
      const formatted = decisions.map((d, i) => {
        return `Decision ${i + 1}: ${d.content.slice(0, 300)}`;
      }).join("\n\n");
      
      return `\nPAST PLANNING DECISIONS:\n${formatted}\n\nConsider these when creating your plan.`;
    } catch (err) {
      logger.warn(`[AdvancedPlanner] Failed to recall past decisions: ${err}`);
      return "";
    }
  }

  /**
   * Recall project context that might be relevant
   */
  private async recallProjectContext(): Promise<string> {
    if (!this.state.memoryStore) return "";
    
    try {
      const contexts = await this.state.memoryStore.retrieve("project_context", ["framework", "test-runner"], 2);
      if (contexts.length === 0) return "";
      
      const formatted = contexts.map((c, i) => {
        return `Context ${i + 1}: ${c.content.slice(0, 300)}`;
      }).join("\n\n");
      
      return `\nPROJECT CONTEXT:\n${formatted}`;
    } catch (err) {
      logger.warn(`[AdvancedPlanner] Failed to recall project context: ${err}`);
      return "";
    }
  }

  async generateMasterPlan(goal: string, availableAgents: AgentName[]): Promise<AgentPlan> {
    if (!this.config.enabled) {
      return this.getDefaultPlan(goal);
    }

    const prompt = await this.buildPlanningPrompt(goal, availableAgents);
    
    try {
      if (!this.provider) return this.getDefaultPlan(goal);

      const response = await this.provider.chat({
        system: "You are a master planner. Create an optimal execution plan with dependencies and parallelization opportunities.",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 4096,
        temperature: 0.2,
        promptCaching: true,
        signal: this.state.abortSignal,
      });

      const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
      const raw = textBlocks.map((b) => b.text).join("\n");
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]) as AgentPlan;
        return this.validateAndEnhancePlan(plan, availableAgents);
      }
    } catch (err) {
      logger.warn(`[AdvancedPlanner] Plan generation failed: ${err}`);
    }

    return this.getDefaultPlan(goal);
  }

  /**
   * Generate a revised plan based on critic feedback from previous execution
   */
  async generateRevisedPlan(
    goal: string, 
    availableAgents: AgentName[], 
    criticFeedback: CriticFeedback[],
    failedAgent?: AgentName
  ): Promise<AgentPlan> {
    if (!this.config.enabled) {
      return this.getDefaultPlan(goal);
    }

    const feedbackSummary = this.formatCriticFeedback(criticFeedback, failedAgent);
    const prompt = this.buildRevisedPlanningPrompt(goal, availableAgents, feedbackSummary);
    
    try {
      if (!this.provider) return this.getDefaultPlan(goal);

      const response = await this.provider.chat({
        system: "You are a master planner. Create a revised execution plan based on critic feedback from previous failed/low-quality execution.",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 4096,
        temperature: 0.2,
        promptCaching: true,
        signal: this.state.abortSignal,
      });

      const textBlocks = response.content.filter((b): b is { type: "text"; text: string } => b.type === "text");
      const raw = textBlocks.map((b) => b.text).join("\n");
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]) as AgentPlan;
        return this.validateAndEnhancePlan(plan, availableAgents);
      }
    } catch (err) {
      logger.warn(`[AdvancedPlanner] Revised plan generation failed: ${err}`);
    }

    return this.getDefaultPlan(goal);
  }

  private formatCriticFeedback(feedback: CriticFeedback[], failedAgent?: AgentName): string {
    if (feedback.length === 0) return "No critic feedback available.";
    
    let summary = "CRITIC FEEDBACK FROM PREVIOUS EXECUTION:\n\n";
    
    for (const fb of feedback) {
      summary += `Agent: ${fb.agent}\n`;
      summary += `Score: ${fb.score}/100\n`;
      if (fb.weaknesses.length > 0) {
        summary += `Weaknesses: ${fb.weaknesses.join(", ")}\n`;
      }
      if (fb.suggestions.length > 0) {
        summary += `Suggestions: ${fb.suggestions.join(", ")}\n`;
      }
      if (fb.shouldRevise) {
        summary += `REVISION REQUIRED: ${fb.revisedOutput ? "Revised output provided" : "No revised output"}\n`;
      }
      summary += "\n";
    }
    
    if (failedAgent) {
      summary += `FAILED AGENT: ${failedAgent}\n`;
    }
    
    return summary;
  }

  private buildRevisedPlanningPrompt(goal: string, availableAgents: AgentName[], criticFeedback: string): string {
    const agentDescriptions: Record<string, string> = {
      [AGENT_NAMES.AGENT_ISSUE_ANALYZER]: "Analyzes GitHub issues and determines test requirements",
      [AGENT_NAMES.AGENT_COMMIT_ANALYZER]: "Analyzes commits and determines if tests are needed",
      [AGENT_NAMES.AGENT_TESTS_GENERATOR]: "Generates Playwright E2E test files from analysis",
      [AGENT_NAMES.AGENT_TESTS_REVIEWER]: "Fixes failing tests based on error analysis",
      [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR]: "Generates comprehensive test reports",
      [AGENT_NAMES.AGENT_SUMMARIZE]: "Creates concise summaries for GitHub comments",
      [CORE_AGENT_NAMES.CRITIC]: "Critiques agent outputs and suggests improvements",
    };

    return `Create a REVISED execution plan for: ${goal}

${criticFeedback}

Available agents:
${availableAgents.map(a => `- ${a}: ${agentDescriptions[a] || "Unknown"}`).join("\n")}

Current state:
- Mode: ${this.state.mode}
- ${this.state.mode === MODE.ISSUE ? `Issue: #${this.state.issue?.number} - ${this.state.issue?.title}` : `Commit: ${this.state.commitDiff?.sha.slice(0,7)}`}
- Retries: ${this.state.retries}/${this.state.testReviewMaxRetries}

Create a REVISED plan as JSON with this exact structure:
{
  "agent": "${CORE_AGENT_NAMES.PLANNER}",
  "goal": "specific goal",
  "steps": [
    {
      "id": "step1",
      "agent": "agent_name",
      "tool": "tool_name",
      "args": {},
      "expectedOutcome": "what we expect",
      "reasoning": "why this step",
      "dependsOn": ["step_id"],
      "canRunParallel": true/false
    }
  ],
  "estimatedIterations": 3,
  "riskLevel": "${RISK_LEVEL.LOW}|${RISK_LEVEL.MEDIUM}|${RISK_LEVEL.HIGH}",
  "parallelGroups": [
    ["step_id1", "step_id2"]
  ]
}

Rules:
1. Steps with no dependencies can run in parallel
2. ${AGENT_NAMES.AGENT_TESTS_REVIEWER} depends on ${AGENT_NAMES.AGENT_TESTS_GENERATOR}
3. ${AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR} depends on test results
4. ${AGENT_NAMES.AGENT_SUMMARIZE} depends on ${AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR}
5. ${CORE_AGENT_NAMES.CRITIC} can run after any agent produces output
6. Max ${this.config.maxPlanSteps} steps

IMPORTANT: Address the critic feedback above. Focus on:
- Fixing weaknesses identified by the critic
- Implementing suggested improvements
- Adding validation steps for previously problematic areas
- Reducing risk level where critic scored low`;
  }

  private async buildPlanningPrompt(goal: string, availableAgents: AgentName[]): Promise<string> {
    const agentDescriptions: Record<string, string> = {
      [AGENT_NAMES.AGENT_ISSUE_ANALYZER]: "Analyzes GitHub issues and determines test requirements",
      [AGENT_NAMES.AGENT_COMMIT_ANALYZER]: "Analyzes commits and determines if tests are needed",
      [AGENT_NAMES.AGENT_TESTS_GENERATOR]: "Generates Playwright E2E test files from analysis",
      [AGENT_NAMES.AGENT_TESTS_REVIEWER]: "Fixes failing tests based on error analysis",
      [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR]: "Generates comprehensive test reports",
      [AGENT_NAMES.AGENT_SUMMARIZE]: "Creates concise summaries for GitHub comments",
      [CORE_AGENT_NAMES.CRITIC]: "Critiques agent outputs and suggests improvements",
    };

    // Recall past decisions and project context
    const pastDecisions = await this.recallPastDecisions();
    const projectContext = await this.recallProjectContext();

    return `Create an execution plan for: ${goal}

Available agents:
${availableAgents.map(a => `- ${a}: ${agentDescriptions[a] || "Unknown"}`).join("\n")}

Current state:
- Mode: ${this.state.mode}
- ${this.state.mode === MODE.ISSUE ? `Issue: #${this.state.issue?.number} - ${this.state.issue?.title}` : `Commit: ${this.state.commitDiff?.sha.slice(0,7)}`}
- Retries: ${this.state.retries}/${this.state.testReviewMaxRetries}
${pastDecisions}
${projectContext}
Create a plan as JSON with this exact structure:
{
  "agent": "${CORE_AGENT_NAMES.PLANNER}",
  "goal": "specific goal",
  "steps": [
    {
      "id": "step1",
      "agent": "agent_name",
      "tool": "tool_name",
      "args": {},
      "expectedOutcome": "what we expect",
      "reasoning": "why this step",
      "dependsOn": ["step_id"],
      "canRunParallel": true/false
    }
  ],
  "estimatedIterations": 3,
  "riskLevel": "${RISK_LEVEL.LOW}|${RISK_LEVEL.MEDIUM}|${RISK_LEVEL.HIGH}",
  "parallelGroups": [
    ["step_id1", "step_id2"]
  ]
}

Rules:
1. Steps with no dependencies can run in parallel
2. ${AGENT_NAMES.AGENT_TESTS_REVIEWER} depends on ${AGENT_NAMES.AGENT_TESTS_GENERATOR}
3. ${AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR} depends on test results
4. ${AGENT_NAMES.AGENT_SUMMARIZE} depends on ${AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR}
5. ${CORE_AGENT_NAMES.CRITIC} can run after any agent produces output
6. Max ${this.config.maxPlanSteps} steps`;
  }

  private validateAndEnhancePlan(plan: AgentPlan, availableAgents: AgentName[]): AgentPlan {
    // Ensure all agents in plan are available
    plan.steps = plan.steps.filter((step: PlanStep) => step.agent && availableAgents.includes(step.agent));
    
    // Add default values
    plan.steps = plan.steps.map((step: PlanStep, i: number) => ({
      ...step,
      id: step.id || `step${i + 1}`,
      dependsOn: step.dependsOn || [],
      canRunParallel: step.canRunParallel ?? false,
    }));

    // Enforce dependency constraints: steps with dependsOn cannot run in parallel
    for (const step of plan.steps) {
      if (step.dependsOn && step.dependsOn.length > 0) {
        step.canRunParallel = false;
      }
    }

    // Auto-detect parallel groups if not specified
    if (!plan.parallelGroups || plan.parallelGroups.length === 0) {
      plan.parallelGroups = this.detectParallelGroups(plan.steps);
    }

    return plan;
  }

  private detectParallelGroups(steps: PlanStep[]): string[][] {
    const groups: string[][] = [];
    const visited = new Set<string>();
    
    for (const step of steps) {
      if (visited.has(step.id)) continue;
      if (!step.canRunParallel) continue;
      
      const stepDeps = step.dependsOn || [];
      const parallel = steps.filter((s: PlanStep) => 
        s.canRunParallel && 
        !visited.has(s.id) &&
        (!s.dependsOn || s.dependsOn.length === 0) &&
        (s.dependsOn || []).length === stepDeps.length &&
        (s.dependsOn || []).every((d: string, i: number) => d === stepDeps[i])
      ).map((s: PlanStep) => {
        visited.add(s.id);
        return s.id;
      });
      
      if (parallel.length > 1) {
        groups.push(parallel);
      }
    }
    
    return groups;
  }

  private getDefaultPlan(goal: string): AgentPlan {
    const mode = this.state.mode;
    const steps: PlanStep[] = [];

    if (mode === MODE.ISSUE) {
      steps.push(
        { id: "analyze", agent: AGENT_NAMES.AGENT_ISSUE_ANALYZER, tool: "analyze_issue", args: {}, expectedOutcome: "Issue analysis", reasoning: "Analyze issue", dependsOn: [], canRunParallel: false },
        { id: "generate", agent: AGENT_NAMES.AGENT_TESTS_GENERATOR, tool: "write_test_file", args: {}, expectedOutcome: "Test file", reasoning: "Generate tests", dependsOn: ["analyze"], canRunParallel: false },
        { id: "review", agent: AGENT_NAMES.AGENT_TESTS_REVIEWER, tool: "write_test_file", args: {}, expectedOutcome: "Fixed tests", reasoning: "Review and fix", dependsOn: ["generate"], canRunParallel: false },
        { id: "report", agent: AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, tool: "generate_report", args: {}, expectedOutcome: "Report", reasoning: "Generate report", dependsOn: ["review"], canRunParallel: true },
        { id: "summarize", agent: AGENT_NAMES.AGENT_SUMMARIZE, tool: "generate_summary", args: {}, expectedOutcome: "Summary", reasoning: "Create summary", dependsOn: ["report"], canRunParallel: false }
      );
    } else {
      steps.push(
        { id: "analyze", agent: AGENT_NAMES.AGENT_COMMIT_ANALYZER, tool: "analyze_commit", args: {}, expectedOutcome: "Commit analysis", reasoning: "Analyze commit", dependsOn: [], canRunParallel: false },
        { id: "generate", agent: AGENT_NAMES.AGENT_TESTS_GENERATOR, tool: "write_test_file", args: {}, expectedOutcome: "Test file", reasoning: "Generate tests", dependsOn: ["analyze"], canRunParallel: false },
        { id: "review", agent: AGENT_NAMES.AGENT_TESTS_REVIEWER, tool: "write_test_file", args: {}, expectedOutcome: "Fixed tests", reasoning: "Review and fix", dependsOn: ["generate"], canRunParallel: false },
        { id: "report", agent: AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR, tool: "generate_report", args: {}, expectedOutcome: "Report", reasoning: "Generate report", dependsOn: ["review"], canRunParallel: true },
        { id: "summarize", agent: AGENT_NAMES.AGENT_SUMMARIZE, tool: "generate_summary", args: {}, expectedOutcome: "Summary", reasoning: "Create summary", dependsOn: ["report"], canRunParallel: false }
      );
    }

    return {
      agent: CORE_AGENT_NAMES.PLANNER,
      goal,
      steps,
      estimatedIterations: steps.length,
      riskLevel: RISK_LEVEL.MEDIUM,
      createdAt: Date.now(),
      parallelGroups: [["report", "summarize"]],
    };
  }
}