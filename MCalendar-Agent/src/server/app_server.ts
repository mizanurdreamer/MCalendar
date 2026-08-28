import { spawn, type ChildProcess } from "node:child_process";
import { logger } from "../utils/logger.js";

export class AppServerManager {
  private process: ChildProcess | null = null;
  private startedByUs = false;
  private port: number = 3000;

  async start(codebasePath: string, port: number, url: string): Promise<void> {
    this.port = port;

    if (await this.isPortInUse(port)) {
      logger.info(`[AppServer] Port ${port} already in use — assuming app server is running`);
      this.startedByUs = false;
      return;
    }

    logger.info(`[AppServer] Starting app server on port ${port}...`);

    this.process = spawn("npm", ["run", "dev"], {
      cwd: codebasePath,
      detached: true,
      stdio: "ignore",
      shell: true,
    });

    this.process.on("error", (err) => {
      logger.warn(`[AppServer] Process error: ${err.message}`);
      this.process = null;
    });

    this.process.on("exit", (code) => {
      logger.info(`[AppServer] Process exited with code ${code}`);
      this.process = null;
    });

    this.startedByUs = true;
    logger.info(`[AppServer] Waiting for app to respond at ${url}...`);

    const ready = await this.waitForReady(url, 120_000);
    if (ready) {
      logger.success(`[AppServer] App server ready at ${url}`);
    } else {
      logger.warn(`[AppServer] App server did not respond within 120s — continuing anyway`);
    }
  }

  async stop(): Promise<void> {
    if (!this.process || !this.startedByUs) {
      return;
    }

    logger.info(`[AppServer] Stopping app server (PID ${this.process.pid})...`);
    try {
      // Kill the process tree on Windows
      if (this.process.pid) {
        spawn("taskkill", ["/pid", String(this.process.pid), "/T", "/F"], {
          stdio: "ignore",
          shell: true,
        });
      }
    } catch (err) {
      logger.warn(`[AppServer] Error stopping process: ${err}`);
    }
    this.process = null;
    this.startedByUs = false;
  }

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const { execSync } = require("node:child_process");
      try {
        const output = execSync(`netstat -ano | findstr :${port}`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        resolve(!!output);
      } catch {
        resolve(false);
      }
    });
  }

  private async waitForReady(url: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.checkUrl(url)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }

  private async checkUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
