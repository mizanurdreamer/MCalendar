import { NextRequest } from "next/server";
import { cleanerAssignmentService } from "@/services/CleanerAssignmentService";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import { z } from "zod";

const createAssignmentSchema = z.object({
  clientId: z.string().uuid(),
  cleanerId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT", "CLEANER");
    const params = parseListParams(req.nextUrl.searchParams);
    const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
    const cleanerId = req.nextUrl.searchParams.get("cleanerId") ?? undefined;
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";

    const result = await cleanerAssignmentService.list(
      { ...params, clientId, cleanerId, activeOnly },
      actor,
    );
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT");
    const body = await req.json();
    const dto = createAssignmentSchema.parse(body);

    const result = await cleanerAssignmentService.create(
      {
        clientId: dto.clientId,
        cleanerId: dto.cleanerId,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      actor,
    );
    return created(result);
  } catch (error) {
    return handleApiError(error);
  }
}
