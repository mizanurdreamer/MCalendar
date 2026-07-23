import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser, dashboardPathForRole } from "@/lib/auth";

const features = [
  {
    icon: Users,
    title: "Role-based access",
    body: "Tailored dashboards for super admins, clients, and roomAttendants.",
  },
  {
    icon: Sparkles,
    title: "User management",
    body: "Create and manage accounts, assign roles, and control access.",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect(dashboardPathForRole(user.role));

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            bookingCalendar
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="container flex flex-1 flex-col items-center justify-center py-20 text-center">
        <span className="mb-4 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Short-term rental operations, simplified
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Run your rental cleaning operation from a single hub
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          bookingCalendar connects administrators and team members so operations stay
          organized in one place.
        </p>
        <div className="mt-8 flex gap-3">
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>

        <div className="mt-16 grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5 text-left">
              <f.icon className="mb-3 h-6 w-6 text-primary" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} bookingCalendar
      </footer>
    </main>
  );
}
