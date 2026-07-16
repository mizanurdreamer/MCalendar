import { NextRequest } from "next/server";
import { smsGatewayService } from "@/services/SmsGatewayService";
import { updateSmsGatewaySchema } from "@/dto/smsGateway.dto";
import { uuidSchema } from "@/dto/common.dto";
import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    await requireActor("SUPER_ADMIN");
    const { id } = await params;
    const item = await smsGatewayService.getById(uuidSchema.parse(id));
    return ok(item);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor("SUPER_ADMIN");
    const { id } = await params;
    const dto = updateSmsGatewaySchema.parse(await req.json());
    const item = await smsGatewayService.update(uuidSchema.parse(id), dto, actor);
    return ok(item);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor("SUPER_ADMIN");
    const { id } = await params;
    await smsGatewayService.remove(uuidSchema.parse(id), actor);
    return ok({ message: "SMS gateway deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
