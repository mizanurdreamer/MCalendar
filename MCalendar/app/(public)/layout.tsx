import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-4 flex items-center justify-center gap-2 font-semibold"
        >
          <span className="text-[#4F7ABD] font-bold text-4xl">booking </span>
          <span className="text-[#826FAE] font-bold text-4xl">calendar</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
