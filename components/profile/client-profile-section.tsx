"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Save } from "lucide-react";
import { updateClientProfileSchema, type UpdateClientProfileDTO } from "@/dto/profile.dto";
import { useClientProfile, useUpdateClientProfile } from "@/hooks/use-profiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { msg } from "@/components/sections/shared-utils";

export function ClientProfileSection() {
  const [editing, setEditing] = React.useState(false);
  const { data, isLoading } = useClientProfile();
  const update = useUpdateClientProfile();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<UpdateClientProfileDTO>({
    resolver: zodResolver(updateClientProfileSchema),
    values: {
      firstName: data?.firstName ?? "",
      lastName: data?.lastName ?? "",
      phone: data?.phone ?? "",
      companyName: data?.companyName ?? "",
      portfolioSize: data?.portfolioSize ?? undefined,
      timezone: data?.timezone ?? "",
    },
  });

  const onSubmit = async (values: UpdateClientProfileDTO) => {
    try {
      await update.mutateAsync(values);
      toast({ title: "Client profile updated" });
      setEditing(false);
    } catch (error) {
      toast({ title: "Update failed", description: msg(error), variant: "destructive" });
    }
  };

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading profile...</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight ">Client Profile</h1>
          <Badge className="rounded-full border-transparent bg-blue-500/15 px-3 py-1 text-blue-700 dark:text-blue-400">CLIENT</Badge>
        </div>
        {!editing ? (
          <Button className="rounded-xl" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-4 w-4" />
            Edit
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                reset();
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={handleSubmit(onSubmit)} disabled={update.isPending}>
              {update.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              <Save className="mr-1 h-4 w-4" />
              Save
            </Button>
          </div>
        )}
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg ">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ProfileInput label="First name" disabled={!editing} error={errors.firstName?.message} {...register("firstName")} />
          <ProfileInput label="Last name" disabled={!editing} error={errors.lastName?.message} {...register("lastName")} />
          <ProfileInput label="Email" value={data.email} disabled />
          <ProfileInput label="Phone" disabled={!editing} error={errors.phone?.message} {...register("phone")} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg ">ClientProfile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ProfileInput label="Company / Brand" disabled={!editing} {...register("companyName")} />
          <ProfileInput
            label="Portfolio size"
            type="number"
            disabled={!editing}
            {...register("portfolioSize", {
              setValueAs: (v) => (v === "" ? undefined : Number(v)),
            })}
          />
          <ProfileInput label="Default timezone" disabled={!editing} {...register("timezone")} />
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileInput(
  props: React.ComponentProps<typeof Input> & {
    label: string;
    error?: string;
  },
) {
  const { label, error, ...inputProps } = props;
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <Input className="mt-2 h-10" {...inputProps} />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
