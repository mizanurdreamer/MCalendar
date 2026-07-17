import { NextRequest } from "next/server";
import { cleanerTaskScheduleService } from "@/services/CleanerTaskScheduleService";
import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import { z } from "zod";

const updateTaskScheduleSchema = z.object({
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  status: z.enum(["ASSIGNED", "CONFIRMED", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT", "CLEANER");
    const { id } = await params;
    const body = await req.json();
    const dto = updateTaskScheduleSchema.parse(body);

    const result = await cleanerTaskScheduleService.update(
      id,
      {
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isActive: dto.isActive,
        status: dto.status,
      },
      actor,
    );
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT");
    const { id } = await params;
    await cleanerTaskScheduleService.remove(id, actor);
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
