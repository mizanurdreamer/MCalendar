/**
 * Next.js instrumentation — runs once on server startup.
 * Bootstraps background processes (cron jobs) in the nodejs runtime only.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { bootstrapCron } = await import("@/services/cron");
  bootstrapCron();
}
