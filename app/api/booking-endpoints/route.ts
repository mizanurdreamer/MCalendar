import { NextRequest } from "next/server";
import { clientBookingEndpointService } from "@/services/ClientBookingEndpointService";
import { createBookingEndpointSchema } from "@/dto/bookingEndpoint.dto";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor("CLIENT");
    const params = parseListParams(req.nextUrl.searchParams);
    const result = await clientBookingEndpointService.list(
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
    const actor = await requireActor("CLIENT");
    const dto = createBookingEndpointSchema.parse(await req.json());
    const endpoint = await clientBookingEndpointService.create(dto, actor);
    return created(endpoint);
  } catch (error) {
    return handleApiError(error);
  }
}
