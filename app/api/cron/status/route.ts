import { NextRequest } from "next/server";
import { cronJobScheduler } from "@/services/cron";
import { CRON_CONFIG } from "@/lib/cron/config";
import { ok, fail, handleApiError } from "@/lib/response";

/**
 * GET /api/cron/status
 * Get the status of all registered cron jobs.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (CRON_CONFIG.CRON_API_SECRET && token !== CRON_CONFIG.CRON_API_SECRET) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }

    const status = cronJobScheduler.getStatus();
    return ok({
      jobs: status,
      schedule: CRON_CONFIG.BOOKING_DATA_FETCH_CRON_SCHEDULE,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
