import { NextRequest } from "next/server";
import { clientBookingProviderService } from "@/services/ClientBookingProviderService";
import { createBookingProviderSchema } from "@/dto/bookingProvider.dto";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const params = parseListParams(req.nextUrl.searchParams);
    const result = await clientBookingProviderService.list(
      { ...params, status: params.status },
      actor,
    );
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const dto = createBookingProviderSchema.parse(await req.json());
    const provider = await clientBookingProviderService.create(dto, actor);
    return created(provider);
  } catch (error) {
    return handleApiError(error);
  }
}
