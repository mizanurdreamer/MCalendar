"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api-client";

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

export function Pagination({
  data,
  page,
  onPage,
  itemLabel = "items",
}: {
  data?: { page: number; totalPages: number; total: number; pageSize: number };
  page: number;
  onPage: (p: number) => void;
  itemLabel?: string;
}) {
  if (!data || data.totalPages <= 1) return null;

  const start = (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.page * data.pageSize, data.total);

  const pages: (number | "...")[] = [];
  if (data.totalPages <= 7) {
    for (let i = 1; i <= data.totalPages; i += 1) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(data.totalPages - 1, page + 1); i += 1) {
      pages.push(i);
    }
    if (page < data.totalPages - 2) pages.push("...");
    pages.push(data.totalPages);
  }

  return (
    <div className="mt-4 flex items-center justify-between px-2 text-sm text-slate-500">
      <span>
        Showing {start}-{end} of {data.total.toLocaleString()} {itemLabel}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="px-2 py-1 text-sm font-semibold text-slate-400 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Prev
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} className="px-2 py-1 text-sm text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={
                p === page
                  ? "flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
                  : "flex h-8 w-8 items-center justify-center rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
              }
            >
              {p}
            </button>
          ),
        )}
        <button
          className="px-2 py-1 text-sm font-semibold text-slate-600 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-50"
          disabled={page >= data.totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function msg(e: unknown) {
  return e instanceof ApiError ? e.message : "Something went wrong";
}

export function ConfirmDialog({
  open,
  title = "Are you sure?",
  description,
  confirmLabel = "Delete",
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
