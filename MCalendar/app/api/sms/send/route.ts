import { NextRequest } from "next/server";
import { sendSmsViaEmailSchema } from "@/dto/smsMail.dto";
import { smsViaEmailService } from "@/services/SmsViaEmailService";
import { created, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";

export async function POST(req: NextRequest) {
  try {
    await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT);
    const dto = sendSmsViaEmailSchema.parse(await req.json());
    const result = await smsViaEmailService.send(dto);
    return created(result);
  } catch (error) {
    return handleApiError(error);
  }
}
