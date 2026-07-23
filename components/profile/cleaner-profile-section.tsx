"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Save } from "lucide-react";
import { updateCleanerProfileSchema, type UpdateCleanerProfileDTO } from "@/dto/profile.dto";
import { useCleanerProfile, useUpdateCleanerProfile } from "@/hooks/use-profiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { msg } from "@/components/sections/shared-utils";

export function CleanerProfileSection() {
  const [editing, setEditing] = React.useState(false);
  const { data, isLoading } = useCleanerProfile();
  const update = useUpdateCleanerProfile();

  const { register, handleSubmit, reset } = useForm<UpdateCleanerProfileDTO>({
    resolver: zodResolver(updateCleanerProfileSchema),
    values: {
      firstName: data?.firstName ?? "",
      lastName: data?.lastName ?? "",
      phone: data?.phone ?? "",
      serviceArea: data?.serviceArea ?? "",
      hourlyRate: data?.hourlyRate ?? undefined,
      rating: data?.rating ?? undefined,
    },
  });

  const onSubmit = async (values: UpdateCleanerProfileDTO) => {
    try {
      await update.mutateAsync(values);
      toast({ title: "Cleaner profile updated" });
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
          <h1 className="text-3xl font-extrabold tracking-tight ">Cleaner Profile</h1>
          <Badge className="rounded-full border-transparent bg-emerald-500/15 px-3 py-1 text-emerald-700">
            CLEANER
          </Badge>
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
          <ProfileInput label="First name" disabled={!editing} {...register("firstName")} />
          <ProfileInput label="Last name" disabled={!editing} {...register("lastName")} />
          <ProfileInput label="Email" value={data.email} disabled />
          <ProfileInput label="Phone" disabled={!editing} {...register("phone")} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg ">CleanerProfile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ProfileInput label="Service area" disabled={!editing} {...register("serviceArea")} />
          <ProfileInput
            label="Hourly rate ($/hr)"
            type="number"
            disabled={!editing}
            {...register("hourlyRate", {
              setValueAs: (v) => (v === "" ? undefined : Number(v)),
            })}
          />
          <ProfileInput
            label="Rating"
            type="number"
            step="0.01"
            disabled={!editing}
            {...register("rating", {
              setValueAs: (v) => (v === "" ? undefined : Number(v)),
            })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileInput(
  props: React.ComponentProps<typeof Input> & {
    label: string;
  },
) {
  const { label, ...inputProps } = props;
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <Input className="mt-2 h-10" {...inputProps} />
    </div>
  );
}
