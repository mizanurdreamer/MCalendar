"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, Download, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { createUserSchema, type CreateUserDTO } from "@/dto/user.dto";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { Field, EmptyRow, Pagination, ConfirmDialog, msg } from "@/components/sections/shared-utils";
import type { Role, UserView } from "@/models/view";

type ManagedRole = Extract<Role, "CLIENT" | "CLEANER">;

type UiStatus = "active" | "inactive" | "pending" | "on_leave";

type UserRowMeta = {
  subtitle: string;
  status: UiStatus;
  primaryContact?: string;
  portfolio?: string;
  serviceArea?: string;
  rate?: string;
};

const CONTACT_POOL = [
  "Nora Whitfield",
  "Devon Park",
  "Ada Okafor",
  "Sam Reyes",
  "Milo Trent",
  "Iris Chen",
  "Ray Delgado",
  "Lena Voss",
  "Ravi Das",
  "Kian Morris",
];

const AREA_POOL = [
  "Mission / SoMa",
  "Oakland",
  "Sunset / Richmond",
  "Berkeley",
  "Daly City",
  "San Mateo",
  "Marina / Pacific Hts",
  "South Bay",
  "Inner Sunset",
  "North Beach",
];

const COPY: Record<
  ManagedRole,
  {
    singular: string;
    plural: string;
    itemLabel: string;
    statuses: { label: string; value: "all" | UiStatus }[];
    sortOptions: { label: string; value: string }[];
  }
> = {
  CLIENT: {
    singular: "Client",
    plural: "Clients",
    itemLabel: "clients",
    statuses: [
      { label: "All", value: "all" },
      { label: "Active", value: "active" },
      { label: "Pending", value: "pending" },
      { label: "Inactive", value: "inactive" },
    ],
    sortOptions: [
      { label: "Sort: Newest", value: "newest" },
      { label: "Sort: Oldest", value: "oldest" },
      { label: "Sort: Name A-Z", value: "name_asc" },
      { label: "Sort: Name Z-A", value: "name_desc" },
    ],
  },
  CLEANER: {
    singular: "Cleaner",
    plural: "Cleaners",
    itemLabel: "cleaners",
    statuses: [
      { label: "All", value: "all" },
      { label: "Active", value: "active" },
      { label: "Inactive", value: "inactive" },
    ],
    sortOptions: [
      { label: "Sort: Rating", value: "rating" },
      { label: "Sort: Newest", value: "newest" },
      { label: "Sort: Name A-Z", value: "name_asc" },
      { label: "Sort: Name Z-A", value: "name_desc" },
    ],
  },
};

function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
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
  const colorIndex = (firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length;

  return (
    <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold", colors[colorIndex])}>
      {initials}
    </div>
  );
}

function getRowMeta(user: UserView, role: ManagedRole): UserRowMeta {
  const seed = hashCode(user.id);

  if (role === "CLIENT") {
    let status: UiStatus = "active";
    if (!user.isActive) status = "inactive";
    else if (seed % 4 === 0) status = "pending";

    return {
      subtitle: user.email,
      status,
      primaryContact: user.primaryContact || CONTACT_POOL[seed % CONTACT_POOL.length],
      portfolio: `${user.portfolioSize ?? (seed % 14) + 1} properties`,
    };
  }

  let status: UiStatus = "active";
  if (!user.isActive) status = "inactive";
  else if (seed % 7 === 0) status = "on_leave";
  else if (seed % 5 === 0) status = "pending";

  return {
    subtitle: user.email,
    status,
    serviceArea: user.serviceArea || AREA_POOL[seed % AREA_POOL.length],
    rate: `$${user.hourlyRate ?? 24 + (seed % 7)}/hr`,
  };
}

function statusBadge(status: UiStatus) {
  if (status === "active") {
    return <Badge className="rounded-full border-transparent bg-emerald-500/20 px-3 py-1 text-[13px] font-semibold text-emerald-700">Active</Badge>;
  }
  if (status === "pending") {
    return <Badge className="rounded-full border-transparent bg-amber-500/25 px-3 py-1 text-[13px] font-semibold text-amber-700">Pending</Badge>;
  }
  if (status === "on_leave") {
    return <Badge className="rounded-full border-transparent bg-amber-500/25 px-3 py-1 text-[13px] font-semibold text-amber-700">On leave</Badge>;
  }
  return <Badge className="rounded-full border-transparent bg-slate-200 px-3 py-1 text-[13px] font-semibold text-slate-600">Inactive</Badge>;
}

export function UsersSection({
  role,
  canCreate = true,
  canDelete = true,
  availabilityBasePath = "/admin/cleaners",
}: {
  role: ManagedRole;
  canCreate?: boolean;
  canDelete?: boolean;
  availabilityBasePath?: string;
}) {
  const copy = COPY[role];
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"all" | UiStatus>("all");
  const [sort, setSort] = React.useState(copy.sortOptions[0].value);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [dialog, setDialog] = React.useState<{ open: boolean; editing?: UserView }>({ open: false });
  const [viewUser, setViewUser] = React.useState<UserView | null>(null);
  const [toDelete, setToDelete] = React.useState<UserView | null>(null);

  const queryStatus = status === "active" || status === "inactive" ? status : "all";
  const { data, isLoading } = useUsers({ page, search, role, status: queryStatus, sort });
  const del = useDeleteUser();

  const filteredItems = React.useMemo(() => {
    const items = data?.items ?? [];
    if (status === "all") return items;
    return items.filter((u) => getRowMeta(u, role).status === status);
  }, [data?.items, role, status]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[30px] font-extrabold tracking-tight text-slate-900">{copy.plural}</h1>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-500">
            {(data?.total ?? 0).toLocaleString()} total
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-10 rounded-xl border-slate-300 px-4 text-[17px] font-semibold text-slate-600">
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setDialog({ open: true })} className="h-10 rounded-xl px-4 text-[17px] font-semibold">
              <Plus className="mr-1 h-4 w-4" />
              Add {copy.singular.toLowerCase()}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={`Search ${copy.plural.toLowerCase()}...`}
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="h-11 w-[272px] rounded-xl border-slate-300 bg-white text-[17px]"
          />

          <div className="flex flex-wrap items-center gap-2">
            {copy.statuses.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full border px-5 py-2 text-[17px] font-semibold transition-colors",
                  status === tab.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-10 w-[150px] rounded-xl border-slate-300 bg-white text-[17px] font-semibold text-slate-600">
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

      <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/70">
              <TableRow className="hover:bg-slate-50/70">
                <TableHead className="w-12 px-4" />
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{role === "CLIENT" ? "Client" : "Cleaner"}</TableHead>
                {role === "CLIENT" ? (
                  <>
                    <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Primary contact</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Phone</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Portfolio</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Service area</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Phone</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Rate</TableHead>
                  </>
                )}
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Status</TableHead>
                <TableHead className="text-right text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <EmptyRow colSpan={7}>Loading...</EmptyRow>
              ) : filteredItems.length > 0 ? (
                filteredItems.map((u) => {
                  const meta = getRowMeta(u, role);
                  return (
                    <TableRow key={u.id} className="h-[74px] border-slate-200 hover:bg-slate-50/40">
                      <TableCell className="px-4">
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          className="h-5 w-5 rounded-md border-slate-300 text-primary focus:ring-primary"
                        />
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-3">
                          <UserAvatar firstName={u.firstName} lastName={u.lastName} />
                          <div>
                            <p className="text-[23px] font-bold leading-[1.1] text-slate-900">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-[17px] text-slate-400">{meta.subtitle}</p>
                          </div>
                        </div>
                      </TableCell>

                      {role === "CLIENT" ? (
                        <>
                          <TableCell className="text-[17px] text-slate-600">{meta.primaryContact}</TableCell>
                          <TableCell className="text-[17px] text-slate-600">{u.phone ?? "-"}</TableCell>
                          <TableCell className="text-[17px] text-slate-600">{meta.portfolio}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-[17px] text-slate-600">{meta.serviceArea}</TableCell>
                          <TableCell className="text-[17px] text-slate-600">{u.phone ?? "-"}</TableCell>
                          <TableCell className="text-[17px] text-slate-600">{meta.rate}</TableCell>
                        </>
                      )}

                      <TableCell>{statusBadge(meta.status)}</TableCell>

                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {role === "CLEANER" && (
                            <button
                              type="button"
                              title="View availability"
                              aria-label="View availability"
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              onClick={() => router.push(`${availabilityBasePath}/${u.id}/availability`)}
                            >
                              <CalendarClock className="h-5 w-5" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="View"
                            aria-label="View"
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => setViewUser(u)}
                          >
                            <Eye className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            title="Edit"
                            aria-label="Edit"
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => setDialog({ open: true, editing: u })}
                          >
                            <Pencil className="h-5 w-5" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              title="Delete"
                              aria-label="Delete"
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setToDelete(u)}
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <EmptyRow colSpan={7}>No {copy.plural.toLowerCase()} found.</EmptyRow>
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
              This will remove <span className="font-medium text-foreground">{toDelete.firstName} {toDelete.lastName}</span>. This action cannot be undone.
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
          companyName: editing.companyName ?? "",
          primaryContact: editing.primaryContact ?? "",
          portfolioSize: editing.portfolioSize ?? undefined,
          timezone: editing.timezone ?? "",
          serviceArea: editing.serviceArea ?? "",
          hourlyRate: editing.hourlyRate ?? undefined,
          rating: editing.rating ?? undefined,
        }
      : {
          role,
          isActive: true,
          password: "",
          confirmPassword: "",
          companyName: "",
          primaryContact: "",
          portfolioSize: undefined,
          timezone: "",
          serviceArea: "",
          hourlyRate: undefined,
          rating: undefined,
        },
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
          companyName: values.companyName,
          primaryContact: values.primaryContact,
          portfolioSize: values.portfolioSize,
          timezone: values.timezone,
          serviceArea: values.serviceArea,
          hourlyRate: values.hourlyRate,
          rating: values.rating,
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
          <DialogTitle>{editing ? `Edit ${copy.singular.toLowerCase()}` : `New ${copy.singular.toLowerCase()}`}</DialogTitle>
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

          {role === "CLIENT" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company / Brand">
                <Input {...register("companyName")} />
              </Field>
              <Field label="Primary contact">
                <Input {...register("primaryContact")} />
              </Field>
              <Field label="Portfolio size">
                <Input
                  type="number"
                  {...register("portfolioSize", {
                    setValueAs: (v) => (v === "" ? undefined : Number(v)),
                  })}
                />
              </Field>
              <Field label="Timezone">
                <Input {...register("timezone")} />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Service area">
                <Input {...register("serviceArea")} />
              </Field>
              <Field label="Hourly rate ($/hr)">
                <Input
                  type="number"
                  {...register("hourlyRate", {
                    setValueAs: (v) => (v === "" ? undefined : Number(v)),
                  })}
                />
              </Field>
              <Field label="Rating">
                <Input
                  type="number"
                  step="0.01"
                  {...register("rating", {
                    setValueAs: (v) => (v === "" ? undefined : Number(v)),
                  })}
                />
              </Field>
            </div>
          )}

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
              <Switch checked={isActive} onCheckedChange={(v) => setValue("isActive", v)} />
              <span className="text-sm text-muted-foreground">{isActive ? "Active" : "Disabled"}</span>
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
              <div className="text-lg font-semibold">{user.firstName} {user.lastName}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Phone</div>
              <div className="text-sm">{user.phone ?? "-"}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Status</div>
              {statusBadge(user.isActive ? "active" : "inactive")}
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Role</div>
              <div className="text-sm capitalize">{user.role.toLowerCase()}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <div className="text-sm">{new Date(user.createdAt).toLocaleDateString()}</div>
            </div>
            {role === "CLIENT" ? (
              <>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Company</div>
                  <div className="text-sm">{user.companyName || "-"}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Primary contact</div>
                  <div className="text-sm">{user.primaryContact || "-"}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Portfolio size</div>
                  <div className="text-sm">
                    {user.portfolioSize !== null && user.portfolioSize !== undefined
                      ? user.portfolioSize
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Timezone</div>
                  <div className="text-sm">{user.timezone || "-"}</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Service area</div>
                  <div className="text-sm">{user.serviceArea || "-"}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Hourly rate</div>
                  <div className="text-sm">
                    {user.hourlyRate !== null && user.hourlyRate !== undefined
                      ? `$${user.hourlyRate}/hr`
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Rating</div>
                  <div className="text-sm">
                    {user.rating !== null && user.rating !== undefined ? user.rating.toFixed(2) : "-"}
                  </div>
                </div>
              </>
            )}
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

