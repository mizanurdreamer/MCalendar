"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import {
  createSmsGatewaySchema,
  type CreateSmsGatewayDTO,
} from "@/dto/smsGateway.dto";
import {
  useSmsGateways,
  useCreateSmsGateway,
  useUpdateSmsGateway,
  useDeleteSmsGateway,
} from "@/hooks/use-sms-gateways";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { FilterTabs } from "@/components/ui/filter-tabs";
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
import type { SmsGatewayView } from "@/models/view";

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

export function SmsGatewaysSection() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [dialog, setDialog] = React.useState<{
    open: boolean;
    editing?: SmsGatewayView;
  }>({ open: false });
  const [toDelete, setToDelete] = React.useState<SmsGatewayView | null>(null);

  const { data, isLoading } = useSmsGateways({ page, search, status });
  const del = useDeleteSmsGateway();

  const onConfirmDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast({ title: "SMS gateway deleted" });
      setToDelete(null);
    } catch (err) {
      toast({ title: "Delete failed", description: msg(err), variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader
        title="SMS Gateways"
        count={data?.total}
        action={
          <Button size="sm" onClick={() => setDialog({ open: true })}>
            <Plus className="h-4 w-4" /> Add gateway
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search gateways..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="w-64"
          />
          <FilterTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Card className="overflow-hidden rounded-2xl">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="">
              <TableRow className="">
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Domain
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
                <EmptyRow colSpan={4}>Loading...</EmptyRow>
              ) : data && data.items.length > 0 ? (
                data.items.map((item) => (
                  <TableRow key={item.id} className="">
                    <TableCell className="text-[17px] font-medium ">
                      {item.name}
                    </TableCell>
                    <TableCell className="text-[17px] text-muted-foreground">{item.domain}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          item.isActive
                            ? "rounded-full border-transparent bg-emerald-500/20 px-3 py-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400"
                            : "rounded-full border-transparent bg-muted px-3 py-1 text-[13px] font-semibold text-muted-foreground"
                        }
                      >
                        {item.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Edit"
                          aria-label="Edit"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() => setDialog({ open: true, editing: item })}
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          aria-label="Delete"
                          className="rounded-lg p-2 text-red-500 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setToDelete(item)}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow colSpan={4}>No SMS gateways found.</EmptyRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination data={data} page={page} onPage={setPage} itemLabel="gateways" />

      {dialog.open && (
        <SmsGatewayFormDialog
          editing={dialog.editing}
          onClose={() => setDialog({ open: false })}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete SMS gateway?"
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

function SmsGatewayFormDialog({
  editing,
  onClose,
}: {
  editing?: SmsGatewayView;
  onClose: () => void;
}) {
  const create = useCreateSmsGateway();
  const update = useUpdateSmsGateway(editing?.id ?? "");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateSmsGatewayDTO>({
    resolver: zodResolver(createSmsGatewaySchema),
    defaultValues: editing
      ? { name: editing.name, domain: editing.domain, isActive: editing.isActive }
      : { name: "", domain: "", isActive: true },
  });

  const isActive = watch("isActive");

  const onSubmit = async (values: CreateSmsGatewayDTO) => {
    try {
      if (editing) {
        await update.mutateAsync(values);
        toast({ title: "SMS gateway updated" });
      } else {
        await create.mutateAsync(values);
        toast({ title: "SMS gateway created" });
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
          <DialogTitle>{editing ? "Edit SMS gateway" : "New SMS gateway"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Name" error={errors.name?.message}>
            <Input placeholder="Enter gateway name" {...register("name")} />
          </Field>
          <Field label="Domain" error={errors.domain?.message}>
            <Input placeholder="Enter email-to-SMS domain" {...register("domain")} />
          </Field>
          <Field label="Status">
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={(v) => setValue("isActive", v)} />
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
