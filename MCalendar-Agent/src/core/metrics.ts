import { logger } from "../utils/logger.js";

export interface AgentMetrics {
  agentName: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  iterations: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  reflectionScore?: number;
  success: boolean;
  error?: string;
}

export interface PipelineMetrics {
  runId: string;
  mode: "issue" | "commit";
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: "running" | "completed" | "failed";
  agents: AgentMetrics[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalToolCalls: number;
  retries: number;
  reflectionScores: number[];
  error?: string;
}

class MetricsCollector {
  private pipelines: Map<string, PipelineMetrics> = new Map();
  private activeAgent: AgentMetrics | null = null;

  startPipeline(runId: string, mode: "issue" | "commit"): void {
    const metrics: PipelineMetrics = {
      runId,
      mode,
      startTime: Date.now(),
      status: "running",
      agents: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalToolCalls: 0,
      retries: 0,
      reflectionScores: [],
    };
    this.pipelines.set(runId, metrics);
  }

  startAgent(agentName: string): void {
    this.activeAgent = {
      agentName,
      startTime: Date.now(),
      iterations: 0,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      success: false,
    };
  }

  recordToolCall(): void {
    if (this.activeAgent) {
      this.activeAgent.toolCalls++;
    }
  }

  recordTokens(input: number, output: number): void {
    if (this.activeAgent) {
      this.activeAgent.inputTokens += input;
      this.activeAgent.outputTokens += output;
    }
  }

  recordIteration(): void {
    if (this.activeAgent) {
      this.activeAgent.iterations++;
    }
  }

  recordReflection(score: number): void {
    if (this.activeAgent) {
      this.activeAgent.reflectionScore = score;
    }
  }

  endAgent(success: boolean, error?: string): void {
    if (this.activeAgent) {
      this.activeAgent.endTime = Date.now();
      this.activeAgent.durationMs = this.activeAgent.endTime - this.activeAgent.startTime;
      this.activeAgent.success = success;
      this.activeAgent.error = error;

      // Add to current pipeline
      const pipeline = this.getCurrentPipeline();
      if (pipeline) {
        pipeline.agents.push(this.activeAgent);
        pipeline.totalInputTokens += this.activeAgent.inputTokens;
        pipeline.totalOutputTokens += this.activeAgent.outputTokens;
        pipeline.totalToolCalls += this.activeAgent.toolCalls;
        if (this.activeAgent.reflectionScore !== undefined) {
          pipeline.reflectionScores.push(this.activeAgent.reflectionScore);
        }
      }

      this.activeAgent = null;
    }
  }

  recordRetry(): void {
    const pipeline = this.getCurrentPipeline();
    if (pipeline) {
      pipeline.retries++;
    }
  }

  endPipeline(status: "completed" | "failed", error?: string): void {
    const pipeline = this.getCurrentPipeline();
    if (pipeline) {
      pipeline.endTime = Date.now();
      pipeline.durationMs = pipeline.endTime - pipeline.startTime;
      pipeline.status = status;
      pipeline.error = error;

      this.logSummary(pipeline);
    }
  }

  getMetrics(runId: string): PipelineMetrics | undefined {
    return this.pipelines.get(runId);
  }

  private getCurrentPipeline(): PipelineMetrics | undefined {
    for (const pipeline of this.pipelines.values()) {
      if (pipeline.status === "running") {
        return pipeline;
      }
    }
    return undefined;
  }

  private logSummary(pipeline: PipelineMetrics): void {
    const duration = pipeline.durationMs ? (pipeline.durationMs / 1000).toFixed(1) : "?";
    const avgReflection = pipeline.reflectionScores.length > 0
      ? (pipeline.reflectionScores.reduce((a, b) => a + b, 0) / pipeline.reflectionScores.length).toFixed(0)
      : "N/A";

    logger.info("─".repeat(60));
    logger.info(`Pipeline Summary (${pipeline.runId.slice(0, 8)})`);
    logger.info("─".repeat(60));
    logger.info(`  Mode: ${pipeline.mode}`);
    logger.info(`  Status: ${pipeline.status}`);
    logger.info(`  Duration: ${duration}s`);
    logger.info(`  Agents: ${pipeline.agents.length}`);
    logger.info(`  Total tokens: ${pipeline.totalInputTokens} in / ${pipeline.totalOutputTokens} out`);
    logger.info(`  Total tool calls: ${pipeline.totalToolCalls}`);
    logger.info(`  Retries: ${pipeline.retries}`);
    logger.info(`  Avg reflection score: ${avgReflection}`);
    logger.info("─".repeat(60));

    for (const agent of pipeline.agents) {
      const agentDuration = agent.durationMs ? (agent.durationMs / 1000).toFixed(1) : "?";
      logger.info(`  ${agent.agentName}: ${agent.success ? "✓" : "✗"} ${agentDuration}s, ${agent.toolCalls} tools, ${agent.iterations} iter, ${agent.inputTokens}/${agent.outputTokens} tokens`);
    }
    logger.info("─".repeat(60));
  }

  getAllMetrics(): PipelineMetrics[] {
    return Array.from(this.pipelines.values());
  }

  clear(): void {
    this.pipelines.clear();
  }
}

export const metrics = new MetricsCollector();
