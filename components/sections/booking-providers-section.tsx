"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Download, Eye, Pencil, Trash2 } from "lucide-react";
import {
  createBookingProviderSchema,
  type CreateBookingProviderDTO,
} from "@/dto/bookingProvider.dto";
import {
  useBookingProviders,
  useCreateBookingProvider,
  useUpdateBookingProvider,
  useDeleteBookingProvider,
} from "@/hooks/use-booking-providers";
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
import type { BookingProviderView } from "@/models/view";

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

export function BookingProvidersSection() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [sort, setSort] = React.useState("newest");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    editing?: BookingProviderView;
  }>({
    open: false,
  });

  const [toDelete, setToDelete] = React.useState<BookingProviderView | null>(null);
  const [viewProvider, setViewProvider] = React.useState<BookingProviderView | null>(null);

  const { data, isLoading } = useBookingProviders({ page, search, status });
  const del = useDeleteBookingProvider();

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
      toast({ title: "Provider deleted" });
      setToDelete(null);
    } catch (err) {
      toast({ title: "Delete failed", description: msg(err), variant: "destructive" });
    }
  };

  const allSelected = data && data.items.length > 0 && selected.size === data.items.length;

  return (
    <div>
      <PageHeader
        title="Booking Providers"
        count={data?.total}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button size="sm" onClick={() => setDialog({ open: true })}>
              <Plus className="h-4 w-4" /> Add provider
            </Button>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search providers…"
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
      <Card className="overflow-hidden rounded-2xl">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="">
              <TableRow className="">
                <TableHead className="w-12 px-4">
                  <input
                    type="checkbox"
                    checked={!!allSelected}
                    onChange={toggleSelectAll}
                    className="h-5 w-5 rounded-md text-primary focus:ring-primary"
                  />
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Provider
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  URL
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-right text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <EmptyRow colSpan={5}>Loading…</EmptyRow>
              ) : data && data.items.length > 0 ? (
                data.items.map((e) => (
                  <TableRow key={e.id} className="hover:bg-accent/50">
                    <TableCell className="px-4">
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => toggleSelect(e.id)}
                        className="h-5 w-5 rounded-md text-primary focus:ring-primary"
                      />
                    </TableCell>
                    <TableCell className="text-[17px] font-medium ">
                      {e.name}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-[17px] text-muted-foreground">
                      {e.url}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          e.isActive
                            ? "rounded-full border-transparent bg-emerald-500/20 px-3 py-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400"
                            : "rounded-full border-transparent bg-muted px-3 py-1 text-[13px] font-semibold text-muted-foreground"
                        }
                      >
                        {e.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="View"
                          aria-label="View"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          onClick={() => setViewProvider(e)}
                        >
                          <Eye className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          title="Edit"
                          aria-label="Edit"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() => setDialog({ open: true, editing: e })}
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          aria-label="Delete"
                          className="rounded-lg p-2 text-red-500 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setToDelete(e)}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow colSpan={5}>No providers found.</EmptyRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination data={data} page={page} onPage={setPage} itemLabel="providers" />

      {dialog.open && (
        <ProviderFormDialog
          editing={dialog.editing}
          onClose={() => setDialog({ open: false })}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete provider?"
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

      {viewProvider && (
        <ProviderViewDialog provider={viewProvider} onClose={() => setViewProvider(null)} />
      )}
    </div>
  );
}

function ProviderFormDialog({
  editing,
  onClose,
}: {
  editing?: BookingProviderView;
  onClose: () => void;
}) {
  const create = useCreateBookingProvider();
  const update = useUpdateBookingProvider(editing?.id ?? "");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateBookingProviderDTO>({
    resolver: zodResolver(createBookingProviderSchema),
    defaultValues: editing
      ? { name: editing.name, url: editing.url, isActive: editing.isActive }
      : { name: "", url: "", isActive: true },
  });

  const isActive = watch("isActive");

  const onSubmit = async (values: CreateBookingProviderDTO) => {
    try {
      if (editing) {
        await update.mutateAsync(values);
        toast({ title: "Provider updated" });
      } else {
        await create.mutateAsync(values);
        toast({ title: "Provider created" });
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
          <DialogTitle>{editing ? "Edit provider" : "New provider"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Name" error={errors.name?.message}>
            <Input placeholder="Enter provider name" {...register("name")} />
          </Field>
          <Field label="URL" error={errors.url?.message}>
            <div className="space-y-2">
              <Input
                placeholder="Enter provider URL"
                {...register("url")}
              />
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

function ProviderViewDialog({
  provider,
  onClose,
}: {
  provider: BookingProviderView;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Provider details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Name</div>
            <div className="text-sm">{provider.name}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">URL</div>
            <div className="break-all text-sm">{provider.url}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              <Badge
                variant={provider.isActive ? "success" : "muted"}
                className={
                  provider.isActive
                    ? "border-transparent bg-emerald-500/15 text-emerald-700"
                    : "border-transparent bg-muted text-muted-foreground"
                }
              >
                {provider.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <div className="text-sm">
                {new Date(provider.createdAt).toLocaleDateString()}
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

