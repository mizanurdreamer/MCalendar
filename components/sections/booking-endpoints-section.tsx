"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Download, Eye, Pencil, Trash2 } from "lucide-react";
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
import { FilterTabs } from "@/components/ui/filter-tabs";
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
import {
  Field,
  EmptyRow,
  Pagination,
  ConfirmDialog,
  msg,
} from "@/components/sections/shared-utils";
import type { BookingEndpointView } from "@/models/view";

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const SORT_OPTIONS = [
  { label: "Sort: Newest", value: "newest" },
  { label: "Sort: Oldest", value: "oldest" },
  { label: "Sort: Name A–Z", value: "name_asc" },
  { label: "Sort: Name Z–A", value: "name_desc" },
];

export function BookingEndpointsSection() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [sort, setSort] = React.useState("newest");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    editing?: BookingEndpointView;
  }>({
    open: false,
  });

  const [toDelete, setToDelete] = React.useState<BookingEndpointView | null>(null);
  const [viewEndpoint, setViewEndpoint] = React.useState<BookingEndpointView | null>(null);

  const { data, isLoading } = useBookingEndpoints({ page, search, status });
  const del = useDeleteBookingEndpoint();

  const toggleSelectAll = () => {
    if (!data) return;
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((e) => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const allSelected = data && data.items.length > 0 && selected.size === data.items.length;

  return (
    <div>
      <PageHeader
        title="Booking Endpoints"
        count={data?.total}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button size="sm" onClick={() => setDialog({ open: true })}>
              <Plus className="h-4 w-4" /> Add endpoint
            </Button>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search endpoints…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="w-64"
          />
          <FilterTabs tabs={STATUS_TABS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={!!allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </TableHead>
                <TableHead>ENDPOINT</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead className="text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <EmptyRow colSpan={5}>Loading…</EmptyRow>
              ) : data && data.items.length > 0 ? (
                data.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => toggleSelect(e.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {e.url}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={e.isActive ? "success" : "muted"}
                        className={
                          e.isActive
                            ? "border-transparent bg-emerald-500/15 text-emerald-700"
                            : "border-transparent bg-muted text-muted-foreground"
                        }
                      >
                        {e.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setViewEndpoint(e)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setDialog({ open: true, editing: e })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive/80"
                          onClick={() => setToDelete(e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow colSpan={5}>No endpoints found.</EmptyRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination data={data} page={page} onPage={setPage} itemLabel="endpoints" />

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

      {viewEndpoint && (
        <EndpointViewDialog endpoint={viewEndpoint} onClose={() => setViewEndpoint(null)} />
      )}
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
            <div className="space-y-2">
              <Input
                placeholder="https://www.airbnb.com/calendar/ical/<listing-id>.ics?t=<token>"
                {...register("url")}
              />
              <p className="text-xs text-slate-500">
                Airbnb example: https://www.airbnb.com/calendar/ical/1505374101975637733.ics?t=ff970f261dc6471792ef4f5996d46acc
              </p>
              <p className="text-xs text-slate-500">
                VRBO example: https://www.vrbo.com/icalendar/d6381199be784af1a05a88492413e278.ics?nonTentative
              </p>
            </div>
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

function EndpointViewDialog({
  endpoint,
  onClose,
}: {
  endpoint: BookingEndpointView;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Endpoint details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Name</div>
            <div className="text-sm">{endpoint.name}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">URL</div>
            <div className="break-all text-sm">{endpoint.url}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              <Badge
                variant={endpoint.isActive ? "success" : "muted"}
                className={
                  endpoint.isActive
                    ? "border-transparent bg-emerald-500/15 text-emerald-700"
                    : "border-transparent bg-muted text-muted-foreground"
                }
              >
                {endpoint.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <div className="text-sm">
                {new Date(endpoint.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
