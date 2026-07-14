import { cronJobScheduler } from "./CronJobScheduler";
import { bookingDataFetchJob } from "./BookingDataFetchJob";
import { CRON_CONFIG } from "@/lib/cron/config";

/**
 * Wire up and start all cron jobs based on configuration.
 * Called once on server startup (see instrumentation.ts).
 */
export function bootstrapCron() {
  if (!CRON_CONFIG.BOOKING_DATA_FETCH_ENABLED) {
    console.log("[Cron] BOOKING_DATA_FETCH_ENABLED is false — job not started");
    return;
  }

  cronJobScheduler.register(
    "booking-data-fetch",
    async () => {
      await bookingDataFetchJob.execute();
    },
    { intervalMs: CRON_CONFIG.BOOKING_DATA_FETCH_INTERVAL_MS },
  );

  cronJobScheduler.startAll();
}
