/**
 * Cron job configuration.
 * All settings come from environment variables.
 */

const toMs = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const CRON_CONFIG = {
  /** Interval between runs (ms) */
  BOOKING_DATA_FETCH_INTERVAL_MS: toMs(
    process.env.CRON_BOOKING_DATA_FETCH_INTERVAL_MS,
    5 * 60 * 1000, // 5 min
  ),

  /** Enable/disable the booking data fetch job */
  BOOKING_DATA_FETCH_ENABLED: process.env.BOOKING_DATA_FETCH_ENABLED !== "false",

  /** Timeout for individual fetch requests (ms) */
  FETCH_TIMEOUT_MS: toMs(process.env.CRON_FETCH_TIMEOUT_MS, 30_000),

  /** API secret for cron trigger authentication */
  CRON_API_SECRET: process.env.CRON_API_SECRET ?? "",
} as const;
