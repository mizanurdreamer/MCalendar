import { CRON_CONFIG } from "@/util/cron/config";

export type CronJobHandler = () => Promise<void>;

interface CronJob {
  name: string;
  handler: CronJobHandler;
  intervalMs: number;
  intervalId?: ReturnType<typeof setInterval>;
  lastRunAt?: Date;
  runCount: number;
}

/**
 * Cron job scheduler. Manages registration and execution of scheduled tasks.
 * Uses interval-based scheduling — jobs start after an initial delay,
 * then repeat at a fixed interval.
 * Configuration comes from environment variables, not the database.
 */
export class CronJobScheduler {
  private jobs = new Map<string, CronJob>();
  private started = false;

  /**
   * Register a cron job with its handler and interval config.
   */
  register(name: string, handler: CronJobHandler, options?: { intervalMs?: number }) {
    this.jobs.set(name, {
      name,
      handler,
      intervalMs: options?.intervalMs ?? CRON_CONFIG.BOOKING_DATA_FETCH_INTERVAL_MS,
      runCount: 0,
    });
    console.log(`[Cron] Registered "${name}" (interval: ${options?.intervalMs ?? CRON_CONFIG.BOOKING_DATA_FETCH_INTERVAL_MS}ms)`);
  }

  /**
   * Start all registered jobs. Each job waits its initial delay, then repeats.
   */
  startAll() {
    if (this.started) return;
    this.started = true;

    for (const [, job] of this.jobs) {
      this.startJob(job);
    }
  }

  /**
   * Stop all running cron jobs.
   */
  stopAll() {
    for (const [, job] of this.jobs) {
      this.stopJob(job);
    }
    this.started = false;
    console.log(`[Cron] All jobs stopped`);
  }

  /**
   * Get status of all registered jobs.
   */
  getStatus() {
    const status: Array<{
      name: string;
      intervalMs: number;
      isActive: boolean;
      lastRunAt: string | null;
      runCount: number;
    }> = [];

    for (const [, job] of this.jobs) {
      status.push({
        name: job.name,
        intervalMs: job.intervalMs,
        isActive: !!job.intervalId,
        lastRunAt: job.lastRunAt?.toISOString() ?? null,
        runCount: job.runCount,
      });
    }

    return status;
  }

  private startJob(job: CronJob) {
    console.log(`[Cron] "${job.name}" started (every ${job.intervalMs / 1000}s)`);

    // Run immediately on start
    this.runJob(job);

    // Then repeat at interval
    job.intervalId = setInterval(async () => {
      await this.runJob(job);
    }, job.intervalMs);
  }

  private stopJob(job: CronJob) {
    if (job.intervalId) {
      clearInterval(job.intervalId);
      job.intervalId = undefined;
    }
  }

  private async runJob(job: CronJob): Promise<boolean> {
    console.log(`[Cron] Executing "${job.name}" (run #${job.runCount + 1})...`);
    const start = Date.now();

    try {
      await job.handler();
      const elapsed = Date.now() - start;
      job.lastRunAt = new Date();
      job.runCount++;
      console.log(`[Cron] "${job.name}" completed in ${elapsed}ms`);
      return true;
    } catch (error) {
      console.error(`[Cron] "${job.name}" failed:`, error);
      return false;
    }
  }
}

export const cronJobScheduler = new CronJobScheduler();
