"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useCleanerAvailability,
  useCreateAvailability,
  useUpdateAvailability,
  useDeleteAvailability,
  type CreateAvailabilityDTO,
} from "@/hooks/use-cleaner-availability";
import { useCleanerProfile } from "@/hooks/use-profiles";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { msg, Field, EmptyRow } from "@/components/sections/shared-utils";
import type { CleanerAvailabilityView } from "@/models/view";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const formSchema = z
  .object({
    fromDate: z.string().regex(DATE_RE, "From date is required"),
    toDate: z.string().regex(DATE_RE, "To date is required").optional().or(z.literal("")),
    note: z.string().max(500).optional(),
  })
  .refine((v) => !v.toDate || v.toDate >= v.fromDate, {
    message: "To date must be on or after from date",
    path: ["toDate"],
  });

type FormValues = z.infer<typeof formSchema>;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${DAYS[d.getDay()]}, ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatRange(from: string, to: string | null) {
  return to ? `${fmt(from)} – ${fmt(to)}` : `${fmt(from)} (open-ended)`;
}

export function CleanerAvailabilityManager() {
  const { data, isLoading } = useCleanerAvailability();
  const { data: profile } = useCleanerProfile();
  const create = useCreateAvailability();
  const update = useUpdateAvailability("");
  const remove = useDeleteAvailability();

  const [editing, setEditing] = React.useState<{ id: string } | null>(null);
  const [open, setOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<{ id: string } | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { fromDate: today, toDate: "", note: "" },
  });

  const openNew = () => {
    reset({ fromDate: today, toDate: "", note: "" });
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (slot: CleanerAvailabilityView) => {
    reset({ fromDate: slot.fromDate, toDate: slot.toDate ?? "", note: slot.note ?? "" });
    setEditing({ id: slot.id });
    setOpen(true);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const cleanerId = profile?.userId;
      if (!cleanerId) throw new Error("Cleaner profile not found");
      const payload: CreateAvailabilityDTO = {
        cleanerId,
        fromDate: values.fromDate,
        toDate: values.toDate ? values.toDate : null,
        note: values.note,
      };
      if (editing) {
        await update.mutateAsync(payload);
        toast({ title: "Availability updated" });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Availability added" });
      }
      setOpen(false);
    } catch (e) {
      toast({ title: "Save failed", description: msg(e), variant: "destructive" });
    }
  };

  const onDelete = async () => {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ title: "Availability removed" });
      setToDelete(null);
    } catch (e) {
      toast({ title: "Delete failed", description: msg(e), variant: "destructive" });
    }
  };

  const slots = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[38px] font-extrabold tracking-tight text-slate-900">My Availability</h1>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-500">
            {slots.length} total
          </span>
        </div>
        <Button size="sm" onClick={openNew} className="h-10 rounded-xl px-4 text-[16px] font-semibold">
          <Plus className="mr-1 h-4 w-4" />
          Add availability
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-200 bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead className="h-12 px-6 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                Date range
              </TableHead>
              <TableHead className="h-12 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                Note
              </TableHead>
              <TableHead className="h-12 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                Status
              </TableHead>
              <TableHead className="h-12 w-[120px] text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <EmptyRow colSpan={4}>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </EmptyRow>
            ) : slots.length === 0 ? (
              <EmptyRow colSpan={4}>
                No availability set yet. Use “Add availability” to enter your availability.
              </EmptyRow>
            ) : (
              slots.map((slot) => (
                <TableRow
                  key={slot.id}
                  className="h-[74px] border-b border-slate-200 transition-colors last:border-b-0 hover:bg-slate-50/60"
                >
                  <TableCell className="px-6 text-[17px] font-medium text-slate-900">
                    {formatRange(slot.fromDate, slot.toDate)}
                  </TableCell>
                  <TableCell className="text-[17px] text-slate-500">
                    {slot.note || <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge className="rounded-full border-transparent bg-emerald-500/20 text-emerald-700">
                      Available
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Edit"
                        aria-label="Edit"
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => openEdit(slot)}
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        aria-label="Delete"
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setToDelete({ id: slot.id })}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit availability" : "Add availability"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="From date" error={errors.fromDate?.message}>
              <Input type="date" {...register("fromDate")} />
            </Field>
            <Field label="To date (optional)" error={errors.toDate?.message}>
              <Input type="date" {...register("toDate")} />
            </Field>
            <Field label="Note (optional)">
              <Input {...register("note")} placeholder="e.g. Deep cleaning only" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {(create.isPending || update.isPending) && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDelete open={!!toDelete} pending={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}

function ConfirmDelete({
  open,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete availability?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">This availability slot will be removed.</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
