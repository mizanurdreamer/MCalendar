"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { createUserSchema, type CreateUserDTO } from "@/dto/user.dto";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/use-users";
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
import type { Role, UserView } from "@/models/view";

type ManagedRole = Extract<Role, "CLIENT" | "CLEANER">;

const COPY: Record<
  ManagedRole,
  { singular: string; plural: string; description: string }
> = {
  CLIENT: {
    singular: "Client",
    plural: "Clients",
    description: "Manage client accounts.",
  },
  CLEANER: {
    singular: "Cleaner",
    plural: "Cleaners",
    description: "Manage cleaner accounts.",
  },
};

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
  const [dialog, setDialog] = React.useState<{ open: boolean; editing?: UserView }>({
    open: false,
  });
  const [toDelete, setToDelete] = React.useState<UserView | null>(null);

  const { data, isLoading } = useUsers({ page, search, role });
  const del = useDeleteUser();

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

  return (
    <div>
      <PageHeader
        title={copy.plural}
        description={copy.description}
        action={
          canCreate ? (
            <Button onClick={() => setDialog({ open: true })}>
              <Plus className="h-4 w-4" /> New {copy.singular.toLowerCase()}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-sm">
        <Input
          placeholder={`Search ${copy.plural.toLowerCase()}…`}
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
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <EmptyRow colSpan={5}>Loading…</EmptyRow>
              ) : data && data.items.length > 0 ? (
                data.items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.firstName} {u.lastName}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "success" : "muted"}>
                        {u.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDialog({ open: true, editing: u })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setToDelete(u)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow colSpan={5}>No {copy.plural.toLowerCase()} found.</EmptyRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination data={data} page={page} onPage={setPage} />

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
          role: editing.role,
          isActive: editing.isActive,
        }
      : { role, isActive: true, password: "" },
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
            <Field label="Password" error={errors.password?.message}>
              <Input type="password" {...register("password")} />
            </Field>
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
