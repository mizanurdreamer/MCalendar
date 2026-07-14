import { NextRequest } from "next/server";
import { cleanerAssignmentService } from "@/services/CleanerAssignmentService";
import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import { z } from "zod";

const updateAssignmentSchema = z.object({
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT");
    const { id } = await params;
    const body = await req.json();
    const dto = updateAssignmentSchema.parse(body);

    const result = await cleanerAssignmentService.update(
      id,
      {
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isActive: dto.isActive,
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
    await cleanerAssignmentService.remove(id, actor);
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
