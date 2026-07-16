import { NextRequest } from "next/server";
import { sendSmsViaEmailSchema } from "@/dto/smsMail.dto";
import { smsViaEmailService } from "@/services/SmsViaEmailService";
import { created, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await requireActor("SUPER_ADMIN", "CLIENT");
    const dto = sendSmsViaEmailSchema.parse(await req.json());
    const result = await smsViaEmailService.send(dto);
    return created(result);
  } catch (error) {
    return handleApiError(error);
  }
}
