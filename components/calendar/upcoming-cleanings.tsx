import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpcomingCleaningView } from "@/models/view";

const STATUS_DOT: Record<string, string> = {
  pending: "#f59e0b",
  cancelled: "#ef4444",
  canceled: "#ef4444",
};

export function UpcomingCleanings({ items }: { items: UpcomingCleaningView[] }) {
  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wide text-slate-400">
            Upcoming cleanings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item) => (
            <div key={`${item.day}-${item.property}`} className="border-b pb-3 last:border-b-0 last:pb-0">
              <div className="flex gap-3">
                  <div className="w-10 text-center">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">{item.month}</p>
                  <p className="text-3xl font-black leading-none text-slate-900">{item.day}</p>
                </div>
                <div className="flex flex-1 items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-2xl font-bold leading-none text-slate-900">{item.property}</p>
                    <p className="text-sm text-slate-500">{item.note}</p>
                  </div>
                  <span
                    className="mt-2 inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STATUS_DOT[item.status ?? ""] ?? "#7c3aed" }}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-slate-200 bg-white">
        <CardContent className="space-y-3 pt-5">
          <button className="flex w-full items-center justify-between border-b pb-3 text-left">
            <span>
              <p className="text-2xl font-bold leading-none text-slate-900">Booking history</p>
              <p className="text-sm text-slate-500">148 completed stays</p>
            </span>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </button>

          <button className="flex w-full items-center justify-between border-b pb-3 text-left">
            <span>
              <p className="text-2xl font-bold leading-none text-slate-900">Properties</p>
              <p className="text-sm text-slate-500">12 active properties</p>
            </span>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </button>

          <button className="flex w-full items-center justify-between text-left">
            <span>
              <p className="text-2xl font-bold leading-none text-slate-900">Monthly summary</p>
              <p className="text-sm text-slate-500">$4,320 spent in June</p>
            </span>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </button>
        </CardContent>
      </Card>

      <p className="px-1 text-sm text-slate-400">Tip: click any booking bar to see its details here.</p>
    </div>
  );
}
