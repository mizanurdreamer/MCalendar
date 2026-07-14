"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Download, Eye, Pencil, Trash2 } from "lucide-react";
import { createUserSchema, type CreateUserDTO } from "@/dto/user.dto";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/use-users";
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
import type { Role, UserView } from "@/models/view";

type ManagedRole = Extract<Role, "CLIENT" | "CLEANER">;

const COPY: Record<
  ManagedRole,
  {
    singular: string;
    plural: string;
    description: string;
    statusTabs: { label: string; value: string }[];
    sortOptions: { label: string; value: string }[];
    itemLabel: string;
  }
> = {
  CLIENT: {
    singular: "Client",
    plural: "Clients",
    description: "Manage client accounts.",
    statusTabs: [
      { label: "All", value: "all" },
      { label: "Active", value: "active" },
      { label: "Inactive", value: "inactive" },
    ],
    sortOptions: [
      { label: "Sort: Newest", value: "newest" },
      { label: "Sort: Oldest", value: "oldest" },
      { label: "Sort: Name A–Z", value: "name_asc" },
      { label: "Sort: Name Z–A", value: "name_desc" },
    ],
    itemLabel: "clients",
  },
  CLEANER: {
    singular: "Cleaner",
    plural: "Cleaners",
    description: "Manage cleaner accounts.",
    statusTabs: [
      { label: "All", value: "all" },
      { label: "Active", value: "active" },
      { label: "Inactive", value: "inactive" },
    ],
    sortOptions: [
      { label: "Sort: Rating", value: "rating" },
      { label: "Sort: Newest", value: "newest" },
      { label: "Sort: Name A–Z", value: "name_asc" },
      { label: "Sort: Name Z–A", value: "name_desc" },
    ],
    itemLabel: "cleaners",
  },
};

function getStatusBadgeVariant(isActive: boolean) {
  return isActive ? "success" : "muted";
}

function getStatusLabel(isActive: boolean) {
  return isActive ? "Active" : "Inactive";
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function UserAvatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = getInitials(firstName, lastName);
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-green-100 text-green-700",
    "bg-purple-100 text-purple-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
    "bg-emerald-100 text-emerald-700",
    "bg-orange-100 text-orange-700",
  ];
  const colorIndex =
    (firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length;
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${colors[colorIndex]}`}
    >
      {initials}
    </div>
  );
}

export function UsersSection({
  role,
  canCreate = true,
  canDelete = true,
}: {
  role: ManagedRole;
  canCreate?: boolean;
  canDelete?: boolean;
}) {
  const copy = COPY[role];
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [sort, setSort] = React.useState(copy.sortOptions[0].value);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [dialog, setDialog] = React.useState<{ open: boolean; editing?: UserView }>({
    open: false,
  });
  const [viewUser, setViewUser] = React.useState<UserView | null>(null);
  const [toDelete, setToDelete] = React.useState<UserView | null>(null);

  const { data, isLoading } = useUsers({ page, search, role, status, sort });
  const del = useDeleteUser();

  const toggleSelectAll = () => {
    if (!data) return;
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((u) => u.id)));
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
      toast({ title: `${copy.singular} deleted` });
      setToDelete(null);
    } catch (e) {
      toast({ title: "Delete failed", description: msg(e), variant: "destructive" });
    }
  };

  const allSelected = data && data.items.length > 0 && selected.size === data.items.length;

  return (
    <div>
      <PageHeader
        title={copy.plural}
        count={data?.total}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => setDialog({ open: true })}>
                <Plus className="h-4 w-4" /> Add {copy.singular.toLowerCase()}
              </Button>
            )}
          </div>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Input
            placeholder={`Search ${copy.plural.toLowerCase()}…`}
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="w-64"
          />
          <FilterTabs tabs={copy.statusTabs} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {copy.sortOptions.map((opt) => (
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
                <TableHead>{role === "CLIENT" ? "CLIENT" : "CLEANER"}</TableHead>
                <TableHead>EMAIL</TableHead>
                <TableHead>PHONE</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead className="text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <EmptyRow colSpan={6}>Loading…</EmptyRow>
              ) : data && data.items.length > 0 ? (
                data.items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar firstName={u.firstName} lastName={u.lastName} />
                        <div>
                          <div className="font-medium">
                            {u.firstName} {u.lastName}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getStatusBadgeVariant(u.isActive)}
                        className={
                          u.isActive
                            ? "border-transparent bg-emerald-500/15 text-emerald-700"
                            : "border-transparent bg-muted text-muted-foreground"
                        }
                      >
                        {getStatusLabel(u.isActive)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setViewUser(u)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setDialog({ open: true, editing: u })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive/80"
                            onClick={() => setToDelete(u)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow colSpan={6}>No {copy.plural.toLowerCase()} found.</EmptyRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination data={data} page={page} onPage={setPage} itemLabel={copy.itemLabel} />

      {dialog.open && (
        <UserFormDialog
          role={role}
          editing={dialog.editing}
          onClose={() => setDialog({ open: false })}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${copy.singular.toLowerCase()}?`}
        description={
          toDelete ? (
            <>
              This will remove{" "}
              <span className="font-medium text-foreground">
                {toDelete.firstName} {toDelete.lastName}
              </span>
              . This action cannot be undone.
            </>
          ) : undefined
        }
        pending={del.isPending}
        onConfirm={onConfirmDelete}
        onClose={() => setToDelete(null)}
      />

      {viewUser && <UserViewDialog user={viewUser} role={role} onClose={() => setViewUser(null)} />}
    </div>
  );
}

function UserFormDialog({
  role,
  editing,
  onClose,
}: {
  role: ManagedRole;
  editing?: UserView;
  onClose: () => void;
}) {
  const copy = COPY[role];
  const create = useCreateUser();
  const update = useUpdateUser(editing?.id ?? "");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateUserDTO>({
    resolver: zodResolver(createUserSchema),
    defaultValues: editing
      ? {
          firstName: editing.firstName,
          lastName: editing.lastName,
          email: editing.email,
          phone: editing.phone ?? "",
          password: "unchanged-placeholder",
          confirmPassword: "unchanged-placeholder",
          role: editing.role,
          isActive: editing.isActive,
        }
      : { role, isActive: true, password: "", confirmPassword: "" },
  });

  const isActive = watch("isActive");

  const onSubmit = async (values: CreateUserDTO) => {
    try {
      if (editing) {
        await update.mutateAsync({
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone,
          role: values.role,
          isActive: values.isActive,
        });
        toast({ title: `${copy.singular} updated` });
      } else {
        await create.mutateAsync({ ...values, role });
        toast({ title: `${copy.singular} created` });
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
          <DialogTitle>
            {editing
              ? `Edit ${copy.singular.toLowerCase()}`
              : `New ${copy.singular.toLowerCase()}`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" error={errors.firstName?.message}>
              <Input {...register("firstName")} />
            </Field>
            <Field label="Last name" error={errors.lastName?.message}>
              <Input {...register("lastName")} />
            </Field>
          </div>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" disabled={!!editing} {...register("email")} />
          </Field>
          <Field label="Phone">
            <Input {...register("phone")} />
          </Field>
          {!editing && (
            <>
              <Field label="Password" error={errors.password?.message}>
                <Input type="password" autoComplete="new-password" {...register("password")} />
              </Field>
              <Field label="Confirm password" error={errors.confirmPassword?.message}>
                <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
              </Field>
            </>
          )}
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

function UserViewDialog({
  user,
  role,
  onClose,
}: {
  user: UserView;
  role: ManagedRole;
  onClose: () => void;
}) {
  const copy = COPY[role];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.singular} details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar firstName={user.firstName} lastName={user.lastName} />
            <div>
              <div className="text-lg font-semibold">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Phone</div>
              <div className="text-sm">{user.phone ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              <Badge
                variant={user.isActive ? "success" : "muted"}
                className={
                  user.isActive
                    ? "border-transparent bg-emerald-500/15 text-emerald-700"
                    : "border-transparent bg-muted text-muted-foreground"
                }
              >
                {user.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Role</div>
              <div className="text-sm capitalize">{user.role.toLowerCase()}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <div className="text-sm">
                {new Date(user.createdAt).toLocaleDateString()}
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
