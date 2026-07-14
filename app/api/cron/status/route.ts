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
    return ok({ jobs: status });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/cron/status
 * Execute a specific cron job by name.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (CRON_CONFIG.CRON_API_SECRET && token !== CRON_CONFIG.CRON_API_SECRET) {
      return fail("UNAUTHORIZED", "Invalid cron secret", 401);
    }

    const body = await req.json();
    const { jobName } = body as { jobName?: string };

    if (!jobName) {
      return fail("BAD_REQUEST", "jobName is required", 400);
    }

    const success = await cronJobScheduler.executeJob(jobName);
    return ok({ success, jobName });
  } catch (error) {
    return handleApiError(error);
  }
}
