import { spawn, type ChildProcess } from "node:child_process";
import { logger } from "../utils/logger.js";

export class AppServerManager {
  private process: ChildProcess | null = null;
  private port: number = 3000;
  private projectPath: string = "";
  private startedByUs: boolean = false;

  async start(projectPath: string, port: number, _apiBaseUrl?: string): Promise<void> {
    this.projectPath = projectPath;
    this.port = port;

    // Check if port is already in use (app may already be running)
    if (await this.isPortInUse(port)) {
      logger.info(`[AppServer] Port ${port} already in use — assuming app is already running`);
      this.startedByUs = false;
      // Still wait for the app to be healthy
      await this.waitForHealthy(port, 30000);
      return;
    }

    this.startedByUs = true;
    logger.info(`[AppServer] Starting Next.js dev server on port ${port}...`);

    this.process = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
      cwd: projectPath,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) logger.debug(`[AppServer] stdout: ${line}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) logger.debug(`[AppServer] stderr: ${line}`);
    });

    this.process.on("error", (err) => {
      logger.error(`[AppServer] Process error: ${err}`);
      this.process = null;
    });

    this.process.on("exit", (code) => {
      logger.info(`[AppServer] Process exited with code ${code}`);
      this.process = null;
    });

    await this.waitForReady(port, 60000);
    await this.waitForHealthy(port, 30000);
    logger.success(`[AppServer] Next.js dev server ready on port ${port}`);
  }

  async stop(): Promise<void> {
    if (!this.process || !this.startedByUs) {
      logger.info(`[AppServer] No process to stop (startedByUs=${this.startedByUs})`);
      return;
    }

    logger.info(`[AppServer] Stopping Next.js dev server...`);

    return new Promise((resolve) => {
      const proc = this.process!;
      const killTimeout = setTimeout(() => {
        logger.warn(`[AppServer] Force killing process`);
        proc.kill("SIGKILL");
        this.process = null;
        resolve();
      }, 10000);

      proc.on("exit", () => {
        clearTimeout(killTimeout);
        this.process = null;
        logger.success(`[AppServer] Next.js dev server stopped`);
        resolve();
      });

      proc.kill("SIGTERM");
    });
  }

  private async isPortInUse(port: number): Promise<boolean> {
    try {
      const net = await import("node:net");
      return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(true));
        server.once("listening", () => {
          server.close(() => resolve(false));
        });
        server.listen(port);
      });
    } catch {
      return false;
    }
  }

  private async waitForReady(port: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const interval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const http = await import("node:http");
        const available = await new Promise<boolean>((resolve) => {
          const req = http.get(`http://localhost:${port}`, (res) => {
            res.resume();
            resolve(res.statusCode !== undefined);
          });
          req.on("error", () => resolve(false));
          req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
          });
        });

        if (available) return;
      } catch {
        // ignore
      }

      await new Promise((r) => setTimeout(r, interval));
    }

    logger.warn(`[AppServer] Server did not become ready within ${timeoutMs}ms, continuing anyway`);
  }

  private async waitForHealthy(port: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const interval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const http = await import("node:http");
        const healthy = await new Promise<boolean>((resolve) => {
          const req = http.get(`http://localhost:${port}`, (res) => {
            res.resume();
            // Consider healthy if not a server error (5xx)
            resolve(!res.statusCode || res.statusCode < 500);
          });
          req.on("error", () => resolve(false));
          req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
          });
        });

        if (healthy) {
          logger.info(`[AppServer] Health check passed on port ${port}`);
          return;
        }
        logger.debug(`[AppServer] Health check failed (port ${port}), retrying...`);
      } catch {
        // ignore
      }

      await new Promise((r) => setTimeout(r, interval));
    }

    logger.warn(`[AppServer] Health check did not pass within ${timeoutMs}ms, continuing anyway`);
  }

  isRunning(): boolean {
    return this.process !== null;
  }
}
