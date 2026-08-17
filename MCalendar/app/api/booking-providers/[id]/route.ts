import { NextRequest } from "next/server";
import { clientBookingProviderService } from "@/services/ClientBookingProviderService";
import { updateBookingProviderSchema } from "@/dto/bookingProvider.dto";
import { uuidSchema } from "@/dto/common.dto";
import { ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const { id } = await params;
    const provider = await clientBookingProviderService.getById(
      uuidSchema.parse(id),
      actor,
    );
    return ok(provider);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const { id } = await params;
    const dto = updateBookingProviderSchema.parse(await req.json());
    const provider = await clientBookingProviderService.update(
      uuidSchema.parse(id),
      dto,
      actor,
    );
    return ok(provider);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const { id } = await params;
    await clientBookingProviderService.remove(uuidSchema.parse(id), actor);
    return ok({ message: "Booking provider deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
