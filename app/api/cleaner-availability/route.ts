import { NextRequest } from "next/server";
import { cleanerAvailabilityService } from "@/services/CleanerAvailabilityService";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import { z } from "zod";

const createAvailabilitySchema = z.object({
  cleanerId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional()
    .nullable(),
  note: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT", "CLEANER");
    const params = parseListParams(req.nextUrl.searchParams);
    const cleanerId = req.nextUrl.searchParams.get("cleanerId") ?? undefined;
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";

    const result = await cleanerAvailabilityService.list(
      { ...params, cleanerId, activeOnly },
      actor,
    );
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT", "CLEANER");
    const body = await req.json();
    const dto = createAvailabilitySchema.parse(body);

    const result = await cleanerAvailabilityService.create(
      {
        cleanerId: dto.cleanerId,
        fromDate: new Date(`${dto.fromDate}T00:00:00.000Z`),
        toDate: dto.toDate ? new Date(`${dto.toDate}T00:00:00.000Z`) : null,
        note: dto.note,
      },
      actor,
    );
    return created(result);
  } catch (error) {
    return handleApiError(error);
  }
}
