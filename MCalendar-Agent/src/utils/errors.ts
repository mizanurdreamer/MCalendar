import { logger } from "./logger.js";

export function setupGlobalErrorHandlers(): void {
  process.on("unhandledRejection", (reason, promise) => {
    logger.error(`[FATAL] Unhandled Rejection at: ${promise}, reason: ${reason}`);
  });

  process.on("uncaughtException", (error) => {
    logger.error(`[FATAL] Uncaught Exception: ${error}`);
    process.exit(1);
  });
}