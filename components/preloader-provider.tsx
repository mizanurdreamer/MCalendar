"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Preloader } from "@/components/ui/preloader";

export function PreloaderProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = React.useState(true);
  const firstRender = React.useRef(true);

  React.useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timeout);
  }, []);

  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timeout);
  }, [pathname]);

  return (
    <>
      <Preloader show={loading} />
      {children}
    </>
  );
}
