import type { SharedContext, StepDefinition } from "./shared_context.js";
import { logger } from "../utils/logger.js";

export async function runPipeline(
  steps: StepDefinition[],
  ctx: SharedContext
): Promise<SharedContext> {
  let i = 0;

  while (i < steps.length && ctx.status === "running") {
    if (ctx.stepHistory.length >= ctx.maxPipelineSteps) {
      logger.error(`Pipeline exceeded ${ctx.maxPipelineSteps} steps — aborting`);
      ctx.status = "failed";
      break;
    }

    const step = steps[i];

    if (step.condition && !step.condition(ctx)) {
      logger.info(`[pipeline] skipping "${step.name}" (condition not met)`);
      i++;
      continue;
    }

    logger.info(`[pipeline] step ${i + 1}/${steps.length}: "${step.name}"`);
    const decision = await step.run(ctx);

    switch (decision.action) {
      case "next":
        logger.info(`[pipeline] "${step.name}" -> next`);
        i++;
        break;

      case "goto": {
        const targetIdx = steps.findIndex((s) => s.name === decision.step);
        if (targetIdx === -1) {
          logger.error(`[pipeline] goto target "${decision.step}" not found — stopping`);
          ctx.status = "failed";
        } else {
          logger.info(`[pipeline] "${step.name}" -> goto "${decision.step}"`);
          i = targetIdx;
        }
        break;
      }

      case "retry": {
        const targetIdx = steps.findIndex((s) => s.name === decision.step);
        if (targetIdx === -1) {
          logger.error(`[pipeline] retry target "${decision.step}" not found — stopping`);
          ctx.status = "failed";
        } else {
          ctx.retries++;
          logger.warn(`[pipeline] "${step.name}" -> retry "${decision.step}" (${ctx.retries}/${ctx.maxRetries})`);
          i = targetIdx;
        }
        break;
      }

      case "stop":
        logger.info(`[pipeline] stopping: ${decision.reason}`);
        ctx.status = "skipped";
        break;

      case "done":
        logger.success(`[pipeline] completed successfully`);
        ctx.status = "completed";
        break;
    }
  }

  if (ctx.status === "running") {
    ctx.status = "completed";
  }

  return ctx;
}
