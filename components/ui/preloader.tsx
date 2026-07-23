"use client";

import * as React from "react";
import { cn } from "@/util/utils";

export function Preloader({
  show,
  label = "Loading…",
}: {
  show: boolean;
  label?: string;
}) {
  const [mounted, setMounted] = React.useState(show);

  React.useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const timeout = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timeout);
  }, [show]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden={!show}
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background transition-opacity duration-300",
        show ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-muted" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary" />
      </div>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
