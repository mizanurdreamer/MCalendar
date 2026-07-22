"use client";

import * as React from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCleanerTaskSchedules, useCreateTaskSchedule, useDeleteTaskSchedule } from "@/hooks/use-cleaner-task-schedules";
import { useCleaners } from "@/hooks/use-lookups";
import { useMe } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Field, EmptyRow, ConfirmDialog, msg } from "@/components/sections/shared-utils";
import type { CleaningStatus } from "@/models/view";

const STATUS_LABEL: Record<CleaningStatus, string> = {
  ASSIGNED: "Assigned",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const STATUS_VARIANT: Record<CleaningStatus, string> = {
  ASSIGNED: "bg-indigo-500/20 text-indigo-700",
  CONFIRMED: "bg-sky-500/20 text-sky-700",
  IN_PROGRESS: "bg-amber-500/20 text-amber-700",
  DONE: "bg-emerald-500/20 text-emerald-700",
  CANCELLED: "bg-red-500/20 text-red-700",
};

function fmtDate(dateStr: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return new Date(dateStr).toLocaleDateString(undefined, opts);
}

export function CleanerAssignmentSection() {
  const { data: me } = useMe();
  const { data, isLoading } = useCleanerTaskSchedules({ page: 1 });
  const cleaners = useCleaners(true);
  const create = useCreateTaskSchedule();
  const remove = useDeleteTaskSchedule();

  const [open, setOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<{ id: string; name: string } | null>(null);
  const [cleanerId, setCleanerId] = React.useState("");
  const [assignedDate, setAssignedDate] = React.useState("");

  const today = new Date().toISOString().slice(0, 10);
  const assignments = data?.items ?? [];

  const openNew = () => {
    setCleanerId(cleaners.data?.[0]?.id ?? "");
    setAssignedDate(today);
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!me) return;
    if (!cleanerId) {
      toast({ title: "Select a cleaner", variant: "destructive" });
      return;
    }
    if (!assignedDate) {
      toast({ title: "Assigned date is required", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({
        clientId: me.id,
        cleanerId,
        assignedDate: `${assignedDate}T00:00:00.000Z`,
      });
      toast({ title: "Cleaner assigned" });
      setOpen(false);
    } catch (e) {
      toast({ title: "Assignment failed", description: msg(e), variant: "destructive" });
    }
  };

  const onDelete = async () => {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ title: "Assignment removed" });
      setToDelete(null);
    } catch (e) {
      toast({ title: "Delete failed", description: msg(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[30px] font-extrabold tracking-tight text-slate-900">Assigned Cleaners</h1>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-500">
            {assignments.length} total
          </span>
        </div>
        <Button size="sm" onClick={openNew} className="h-10 rounded-xl px-4 text-[16px] font-semibold">
          <Plus className="mr-1 h-4 w-4" />
          Assign cleaner
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white">
        <Table>
          <TableHeader className="bg-slate-50/70">
            <TableRow className="hover:bg-slate-50/70">
              <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Cleaner</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Assigned date</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Status</TableHead>
              <TableHead className="w-[120px] text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <EmptyRow colSpan={4}>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading…
              </EmptyRow>
            ) : assignments.length === 0 ? (
              <EmptyRow colSpan={4}>
                No cleaners assigned yet. Assign a cleaner so they can see your bookings on their calendar.
              </EmptyRow>
            ) : (
              assignments.map((a) => (
                <TableRow key={a.id} className="h-[74px] border-slate-200 hover:bg-slate-50/40">
                  <TableCell>
                    <p className="text-[17px] font-semibold text-slate-900">{a.cleanerName}</p>
                    <p className="text-sm text-slate-400">{a.cleanerEmail}</p>
                  </TableCell>
                  <TableCell className="text-[17px] text-slate-600">{fmtDate(a.assignedDate)}</TableCell>
                  <TableCell>
                    <Badge className={`rounded-full border-transparent ${STATUS_VARIANT[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      title="Remove"
                      aria-label="Remove"
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setToDelete({ id: a.id, name: a.cleanerName })}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
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
            <DialogTitle>Assign a cleaner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Cleaner">
              <Select value={cleanerId || "__none"} onValueChange={setCleanerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a cleaner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select a cleaner</SelectItem>
                  {(cleaners.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                      {c.serviceArea ? ` · ${c.serviceArea}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assigned date">
              <Input type="date" value={assignedDate} min={today} onChange={(e) => setAssignedDate(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        title="Remove assignment?"
        description={
          toDelete ? (
            <>
              <span className="font-medium text-foreground">{toDelete.name}</span> will no longer see your bookings on their calendar.
            </>
          ) : undefined
        }
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={onDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
