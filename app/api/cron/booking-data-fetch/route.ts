import { NextRequest } from "next/server";
import { bookingDataFetchJob } from "@/services/cron";
import { CRON_CONFIG } from "@/lib/cron/config";
import { ok, fail, handleApiError } from "@/lib/response";

/**
 * POST /api/cron/booking-data-fetch
 *
 * Trigger the booking data fetch cron job.
 * Protected by CRON_API_SECRET header for external cron services
 * (Vercel Cron, GitHub Actions, cron-job.org, etc.).
 *
 * Example usage with Vercel Cron (vercel.json):
 * {
 *   "crons": [{ "path": "/api/cron/booking-data-fetch", "schedule": "0 2 * * *" }]
 * }
 *
 * Or trigger manually:
 * curl -X POST https://yourapp.com/api/cron/booking-data-fetch \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate with cron secret (skip in development if not set)
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (CRON_CONFIG.CRON_API_SECRET && token !== CRON_CONFIG.CRON_API_SECRET) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }

    const result = await bookingDataFetchJob.execute();
    return ok({
      message: "Booking data fetch completed",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/cron/booking-data-fetch
 * Health check endpoint for monitoring.
 */
export async function GET() {
  return ok({
    status: "ok",
    job: "booking-data-fetch",
    timestamp: new Date().toISOString(),
  });
}
