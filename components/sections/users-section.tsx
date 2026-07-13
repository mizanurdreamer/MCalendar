"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { createUserSchema, type CreateUserDTO } from "@/dto/user.dto";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@/hooks/use-users";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Field, EmptyRow, Pagination, msg } from "@/components/sections/shared-utils";
import type { Role, UserView } from "@/models/view";

const ROLES: Role[] = ["SUPER_ADMIN", "CLIENT", "CLEANER"];
const ROLE_VARIANT: Record<Role, React.ComponentProps<typeof Badge>["variant"]> = {
  SUPER_ADMIN: "default",
  CLIENT: "info",
  CLEANER: "success",
};

export function UsersSection() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<{ open: boolean; editing?: UserView }>({
    open: false,
  });

  const { data, isLoading } = useUsers({ page, search });
  const del = useDeleteUser();

  const onDelete = async (u: UserView) => {
    if (!confirm(`Delete ${u.firstName} ${u.lastName}?`)) return;
    try {
      await del.mutateAsync(u.id);
      toast({ title: "User deleted" });
    } catch (e) {
      toast({ title: "Delete failed", description: msg(e), variant: "destructive" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage platform accounts and roles."
        action={
          <Button onClick={() => setDialog({ open: true })}>
            <Plus className="h-4 w-4" /> New user
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search users…"
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
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
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
                    <TableCell>
                      <Badge variant={ROLE_VARIANT[u.role]}>{u.role.replace("_", " ")}</Badge>
                    </TableCell>
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
                      <Button variant="ghost" size="icon" onClick={() => onDelete(u)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <EmptyRow colSpan={5}>No users found.</EmptyRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination data={data} page={page} onPage={setPage} />

      {dialog.open && (
        <UserFormDialog editing={dialog.editing} onClose={() => setDialog({ open: false })} />
      )}
    </div>
  );
}

function UserFormDialog({ editing, onClose }: { editing?: UserView; onClose: () => void }) {
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
      : { role: "CLIENT", isActive: true, password: "" },
  });

  const role = watch("role");
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
        toast({ title: "User updated" });
      } else {
        await create.mutateAsync(values);
        toast({ title: "User created" });
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
          <DialogTitle>{editing ? "Edit user" : "New user"}</DialogTitle>
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
          <Field label="Role">
            <Select value={role} onValueChange={(v) => setValue("role", v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={isActive ? "true" : "false"}
              onValueChange={(v) => setValue("isActive", v === "true")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Disabled</SelectItem>
              </SelectContent>
            </Select>
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
