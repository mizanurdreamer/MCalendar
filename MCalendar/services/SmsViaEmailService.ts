import nodemailer from "nodemailer";
import { prisma } from "@/util/prisma";
import { BadRequestError, NotFoundError } from "@/util/errors";
import type { SendSmsViaEmailDTO } from "@/dto/smsMail.dto";

type ResolvedGateway = {
  id: string | null;
  name: string;
  domain: string;
};

function toBool(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function normalizeDomain(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new BadRequestError("Phone number must contain 10-15 digits");
  }
  return digits;
}

/**
 * Sends SMS messages via carrier email gateways.
 * Example target address: 15551234567@tmomail.net
 */
export class SmsViaEmailService {
  private createTransporter() {
    const host = process.env.SMS_SMTP_HOST;
    if (!host) throw new BadRequestError("Missing SMS_SMTP_HOST");

    const port = Number(process.env.SMS_SMTP_PORT ?? 587);
    const secure = toBool(process.env.SMS_SMTP_SECURE, false);
    const user = process.env.SMS_SMTP_USER;
    const pass = process.env.SMS_SMTP_PASS;
    const tlsServername = process.env.SMS_SMTP_TLS_SERVERNAME?.trim();
    const tlsRejectUnauthorized =
      process.env.SMS_SMTP_TLS_REJECT_UNAUTHORIZED === undefined
        ? undefined
        : toBool(process.env.SMS_SMTP_TLS_REJECT_UNAUTHORIZED, true);

    const tlsOptions: {
      servername?: string;
      rejectUnauthorized?: boolean;
    } = {};
    if (tlsServername) tlsOptions.servername = tlsServername;
    if (tlsRejectUnauthorized !== undefined) {
      tlsOptions.rejectUnauthorized = tlsRejectUnauthorized;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      tls: Object.keys(tlsOptions).length > 0 ? tlsOptions : undefined,
    });
  }

  private async resolveGateway(dto: SendSmsViaEmailDTO): Promise<ResolvedGateway> {
    if (dto.domain) {
      return {
        id: null,
        name: dto.gatewayName ?? "Custom gateway",
        domain: normalizeDomain(dto.domain),
      };
    }

    const item = dto.gatewayId
      ? await prisma.smsGateway.findFirst({
          where: { id: dto.gatewayId, deletedAt: null, isActive: true },
        })
      : await prisma.smsGateway.findFirst({
          where: { name: dto.gatewayName, deletedAt: null, isActive: true },
        });

    if (!item) throw new NotFoundError("SMS gateway not found");

    return {
      id: item.id,
      name: item.name,
      domain: normalizeDomain(item.domain),
    };
  }

  async send(dto: SendSmsViaEmailDTO) {
    const from = process.env.SMS_EMAIL_FROM ?? process.env.SMS_SMTP_USER;
    if (!from) throw new BadRequestError("Missing SMS_EMAIL_FROM");

    const gateway = await this.resolveGateway(dto);
    const phone = normalizePhone(dto.phone);
    const to = `${phone}@${gateway.domain}`;
    const subject = dto.subject?.trim() || "SMS Notification";
    const text = dto.message.trim();

    const transporter = this.createTransporter();
    let info: Awaited<ReturnType<typeof transporter.sendMail>>;
    try {
      info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
      });
    } catch (error) {
      throw new BadRequestError(
        "SMTP connect/send failed. Check SMS_SMTP_HOST, SMS_SMTP_PORT, and TLS certificate host.",
        error,
      );
    }

    return {
      to,
      phone,
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      domain: gateway.domain,
      messageId: info.messageId,
    };
  }
}

export const smsViaEmailService = new SmsViaEmailService();
