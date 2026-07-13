"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createBookingEndpointSchema,
  type CreateBookingEndpointDTO,
} from "@/dto/bookingEndpoint.dto";
import {
  useBookingEndpoints,
  useCreateBookingEndpoint,
  useUpdateBookingEndpoint,
  useDeleteBookingEndpoint,
} from "@/hooks/use-booking-endpoints";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Field,
  EmptyRow,
  Pagination,
  ConfirmDialog,
  msg,
} from "@/components/sections/shared-utils";
import type { BookingEndpointView } from "@/models/view";

export function BookingEndpointsSection() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    editing?: BookingEndpointView;
  }>({
    open: false,
  });

  const [toDelete, setToDelete] = React.useState<BookingEndpointView | null>(null);

  const { data, isLoading } = useBookingEndpoints({ page, search });
  const del = useDeleteBookingEndpoint();

  const onConfirmDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast({ title: "Endpoint deleted" });
      setToDelete(null);
    } catch (err) {
      toast({ title: "Delete failed", description: msg(err), variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Booking Endpoints"
        description="Manage your calendar sync (iCal) URLs."
        action={
          <Button onClick={() => setDialog({ open: true })}>
            <Plus className="h-4 w-4" /> New endpoint
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search endpoints…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <EmptyRow colSpan={4}>Loading…</EmptyRow>
              ) : data && data.items.length > 0 ? (
                data.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {e.url}
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.isActive ? "success" : "muted"}>
                        {e.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDialog({ open: true, editing: e })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setToDelete(e)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow colSpan={4}>No endpoints found.</EmptyRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination data={data} page={page} onPage={setPage} />

      {dialog.open && (
        <EndpointFormDialog
          editing={dialog.editing}
          onClose={() => setDialog({ open: false })}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete endpoint?"
        description={
          toDelete ? (
            <>
              This will remove{" "}
              <span className="font-medium text-foreground">{toDelete.name}</span>. This
              action cannot be undone.
            </>
          ) : undefined
        }
        pending={del.isPending}
        onConfirm={onConfirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function EndpointFormDialog({
  editing,
  onClose,
}: {
  editing?: BookingEndpointView;
  onClose: () => void;
}) {
  const create = useCreateBookingEndpoint();
  const update = useUpdateBookingEndpoint(editing?.id ?? "");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateBookingEndpointDTO>({
    resolver: zodResolver(createBookingEndpointSchema),
    defaultValues: editing
      ? { name: editing.name, url: editing.url, isActive: editing.isActive }
      : { name: "", url: "", isActive: true },
  });

  const isActive = watch("isActive");

  const onSubmit = async (values: CreateBookingEndpointDTO) => {
    try {
      if (editing) {
        await update.mutateAsync(values);
        toast({ title: "Endpoint updated" });
      } else {
        await create.mutateAsync(values);
        toast({ title: "Endpoint created" });
      }
      onClose();
    } catch (e) {
      toast({ title: "Save failed", description: msg(e), variant: "destructive" });
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit endpoint" : "New endpoint"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Name" error={errors.name?.message}>
            <Input placeholder="e.g. Airbnb — Main listing" {...register("name")} />
          </Field>
          <Field label="URL" error={errors.url?.message}>
            <Input
              placeholder="https://www.airbnb.com/calendar/ical/….ics"
              {...register("url")}
            />
          </Field>
          <Field label="Status">
            <div className="flex items-center gap-3">
              <Switch
                checked={isActive}
                onCheckedChange={(v) => setValue("isActive", v)}
              />
              <span className="text-sm text-muted-foreground">
                {isActive ? "Active" : "Disabled"}
              </span>
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
