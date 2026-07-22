import { cronJobScheduler } from "./CronJobScheduler";
import { bookingDataFetchJob } from "./BookingDataFetchJob";
import { autoAssignCleanerJob } from "./AutoAssignCleanerJob";
import { CRON_CONFIG } from "@/lib/cron/config";

/**
 * Wire up and start all cron jobs based on configuration.
 * Called once on server startup (see instrumentation.ts).
 */
export function bootstrapCron() {
  if (CRON_CONFIG.BOOKING_DATA_FETCH_ENABLED) {
    cronJobScheduler.register(
      "booking-data-fetch",
      async () => {
        await bookingDataFetchJob.execute();
      },
      { intervalMs: CRON_CONFIG.BOOKING_DATA_FETCH_INTERVAL_MS },
    );
    console.log(`[Cron] booking-data-fetch schedule: ${CRON_CONFIG.BOOKING_DATA_FETCH_CRON_SCHEDULE}`);
  } else {
    console.log("[Cron] CRON_BOOKING_DATA_FETCH_ENABLED is false — booking-data-fetch not started");
  }

  if (CRON_CONFIG.AUTO_ASSIGN_CLEANER_ENABLED) {
    cronJobScheduler.register(
      "auto-assign-cleaner",
      async () => {
        const result = await autoAssignCleanerJob.execute();
        console.log(`[Cron] auto-assign-cleaner result:`, result);
      },
      { intervalMs: CRON_CONFIG.AUTO_ASSIGN_CLEANER_INTERVAL_MS },
    );
    console.log(`[Cron] auto-assign-cleaner interval: ${CRON_CONFIG.AUTO_ASSIGN_CLEANER_INTERVAL_MS}ms`);
  } else {
    console.log("[Cron] AUTO_ASSIGN_CLEANER_ENABLED is false — auto-assign-cleaner not started");
  }

  cronJobScheduler.startAll();
}
