"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/util/api-client";
import { toast } from "@/hooks/use-toast";

type Option = {
  userId: string;
  clientId: string | null;
  clientName: string | null;
  firstName: string;
  lastName: string;
};

export default function RoomAttendantSelectClientPage() {
  const router = useRouter();
  const optionsQuery = useQuery({
    queryKey: ["room-attendant-client-options"],
    queryFn: () => api.get<{ options: Option[] }>("/api/auth/room-attendant-client"),
  });

  const selectMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<{ user: unknown }>("/api/auth/room-attendant-client", { userId }),
    onSuccess: () => {
      router.replace("/room-attendant/today");
      router.refresh();
    },
    onError: () => {
      toast({ title: "Could not switch Room Attendant session", variant: "error" });
    },
  });

  if (optionsQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading clients...
        </CardContent>
      </Card>
    );
  }

  const options = optionsQuery.data?.options ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select client for this session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {options.map((option) => (
          <div key={option.userId} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">{option.clientName || "No client assigned"}</p>
              <p className="text-sm text-muted-foreground">
                {option.firstName} {option.lastName}
              </p>
            </div>
            <Button
              onClick={() => selectMutation.mutate(option.userId)}
              disabled={selectMutation.isPending}
            >
              {selectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
