/**
 * Cron job configuration.
 * All settings come from environment variables.
 */

const toInt = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** How often (in minutes) the booking data fetch cron should run. Default 10. */
const BOOKING_DATA_FETCH_SCHEDULE_IN_MINUTES = toInt(
  process.env.CRON_BOOKING_DATA_FETCH_SCHEDULE_IN_MINUTES,
  10,
);

/** How often (in minutes) the auto-assign cleaner cron should run. Default 60. */
const AUTO_ASSIGN_CLEANER_SCHEDULE_IN_MINUTES = toInt(
  process.env.CRON_AUTO_ASSIGN_CLEANER_SCHEDULE_IN_MINUTES,
  60,
);

export const CRON_CONFIG = {
  /** Plain minute value for the booking data fetch cron (e.g. 10 => every 10 minutes). */
  BOOKING_DATA_FETCH_SCHEDULE_IN_MINUTES,

  /** Cron schedule expression for external triggers, e.g. every 10 minutes. */
  BOOKING_DATA_FETCH_CRON_SCHEDULE:
    "*/" + BOOKING_DATA_FETCH_SCHEDULE_IN_MINUTES + " * * * *",

  /** Interval between runs (ms), derived from BOOKING_DATA_FETCH_SCHEDULE_IN_MINUTES. */
  BOOKING_DATA_FETCH_INTERVAL_MS: BOOKING_DATA_FETCH_SCHEDULE_IN_MINUTES * 60 * 1000,

  /** Enable/disable the booking data fetch job */
  BOOKING_DATA_FETCH_ENABLED: process.env.CRON_BOOKING_DATA_FETCH_ENABLED !== "false",

  /** Interval between runs (ms) for the auto-assign cleaner job. */
  AUTO_ASSIGN_CLEANER_INTERVAL_MS: AUTO_ASSIGN_CLEANER_SCHEDULE_IN_MINUTES * 60 * 1000,

  /** Enable/disable the auto-assign cleaner job */
  AUTO_ASSIGN_CLEANER_ENABLED: process.env.CRON_AUTO_ASSIGN_CLEANER_ENABLED !== "false",

  /** API secret for cron trigger authentication */
  CRON_BOOKING_ENDPOINT_API_SECRET: process.env.CRON_BOOKING_ENDPOINT_API_SECRET ?? "",
} as const;
