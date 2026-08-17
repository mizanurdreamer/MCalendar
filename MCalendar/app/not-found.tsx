import Link from "next/link";
import { Sparkles, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <div className="flex items-center gap-2 font-semibold">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            bookingCalendar
          </div>

          <p className="text-6xl font-bold tracking-tight text-primary">404</p>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">Page not found</h1>
            <p className="text-sm text-muted-foreground">
              The page you&apos;re looking for doesn&apos;t exist or may have been
              moved.
            </p>
          </div>

          <Button asChild className="w-full">
            <Link href="/">
              <Home className="h-4 w-4" />
              Back to home
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
