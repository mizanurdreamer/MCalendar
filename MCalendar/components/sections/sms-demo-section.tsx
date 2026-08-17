"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Field, msg } from "@/components/sections/shared-utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSmsGateways } from "@/hooks/use-sms-gateways";
import { useSendSmsViaEmail } from "@/hooks/use-sms-mail";
import { toast } from "@/hooks/use-toast";

export function SmsDemoSection() {
  const { data: gatewaysData, isLoading: gatewaysLoading } = useSmsGateways({
    page: 1,
    pageSize: 100,
    status: "active",
  });
  const sendSms = useSendSmsViaEmail();

  const [gatewayId, setGatewayId] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [text, setText] = React.useState("");

  const gateways = React.useMemo(() => gatewaysData?.items ?? [], [gatewaysData?.items]);

  React.useEffect(() => {
    if (!gatewayId && gateways.length > 0) {
      setGatewayId(gateways[0].id);
    }
  }, [gatewayId, gateways]);

  const onSend = async () => {
    if (!gatewayId || !phone.trim() || !text.trim()) {
      toast({
        title: "Missing fields",
        description: "Gateway, phone number, and text are required.",
        variant: "warning",
      });
      return;
    }

    try {
      const result = await sendSms.mutateAsync({
        gatewayId,
        phone: phone.trim(),
        message: text.trim(),
      });
      toast({
        title: "SMS sent",
        description: `Delivered via ${result.to}`,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Send failed",
        description: msg(e),
        variant: "error",
      });
    }
  };

  return (
    <div>
      <PageHeader title="SMS Demo" />

      <Card className="max-w-2xl">
        <CardContent className="space-y-4 pt-6">
          <Field label="Gateway">
            <Select
              value={gatewayId}
              onValueChange={setGatewayId}
              disabled={gatewaysLoading || gateways.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={gatewaysLoading ? "Loading..." : "Select gateway"} />
              </SelectTrigger>
              <SelectContent>
                {gateways.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} ({g.domain})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="To Number">
            <Input
              placeholder="e.g. 15551234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          <Field label="Text">
            <Textarea
              placeholder="Enter SMS message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
            />
          </Field>

          <Button
            onClick={onSend}
            disabled={sendSms.isPending || gateways.length === 0}
            className="min-w-28"
          >
            {sendSms.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
