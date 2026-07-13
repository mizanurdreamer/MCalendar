import { NextRequest } from "next/server";
import { clientBookingEndpointService } from "@/services/ClientBookingEndpointService";
import { updateBookingEndpointSchema } from "@/dto/bookingEndpoint.dto";
import { uuidSchema } from "@/dto/common.dto";
import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor("CLIENT");
    const { id } = await params;
    const endpoint = await clientBookingEndpointService.getById(
      uuidSchema.parse(id),
      actor,
    );
    return ok(endpoint);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor("CLIENT");
    const { id } = await params;
    const dto = updateBookingEndpointSchema.parse(await req.json());
    const endpoint = await clientBookingEndpointService.update(
      uuidSchema.parse(id),
      dto,
      actor,
    );
    return ok(endpoint);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor("CLIENT");
    const { id } = await params;
    await clientBookingEndpointService.remove(uuidSchema.parse(id), actor);
    return ok({ message: "Booking endpoint deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
