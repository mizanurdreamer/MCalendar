"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/util/api-client";

export type SendSmsPayload = {
  gatewayId: string;
  phone: string;
  message: string;
};

export type SendSmsResult = {
  to: string;
  phone: string;
  gatewayId: string | null;
  gatewayName: string;
  domain: string;
  messageId: string;
};

export function useSendSmsViaEmail() {
  return useMutation({
    mutationFn: (body: SendSmsPayload) => api.post<SendSmsResult>("/api/sms/send", body),
  });
}
