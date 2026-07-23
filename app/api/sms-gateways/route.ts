import { NextRequest } from "next/server";
import { smsGatewayService } from "@/services/SmsGatewayService";
import { createSmsGatewaySchema } from "@/dto/smsGateway.dto";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";

export async function GET(req: NextRequest) {
  try {
    await requireActor(UserRole.SUPER_ADMIN);
    const params = parseListParams(req.nextUrl.searchParams);
    const result = await smsGatewayService.list({ ...params, status: params.status });
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.SUPER_ADMIN);
    const dto = createSmsGatewaySchema.parse(await req.json());
    const item = await smsGatewayService.create(dto, actor);
    return created(item);
  } catch (error) {
    return handleApiError(error);
  }
}
