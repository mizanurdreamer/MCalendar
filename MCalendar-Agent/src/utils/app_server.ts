import { spawn, type ChildProcess } from "node:child_process";
import { logger } from "./logger.js";

export class AppServerManager {
  private process: ChildProcess | null = null;
  private port: number = 3000;
  private projectPath: string = "";
  private startedByUs: boolean = false;

  async start(projectPath: string, port: number, _apiBaseUrl?: string): Promise<void> {
    this.projectPath = projectPath;
    this.port = port;

    logger.info(`[AppServer] Initializing on port ${port}...`);

    // Check if port is already in use (app may already be running)
    if (await this.isPortInUse(port)) {
      logger.info(`[AppServer] Port ${port} already in use — checking if app is healthy`);
      const healthy = await this.waitForHealthy(port, 10000);
      if (healthy) {
        this.startedByUs = false;
        return;
      }
      //logger.warn(`[AppServer] Port ${port} occupied but app not healthy — killing existing process`);
      await this.forceKillPort(port);
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
      //if (line) logger.debug(`[AppServer] stdout: ${line}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      //if (line) logger.debug(`[AppServer] stderr: ${line}`);
    });

    this.process.on("error", (err) => {
      //logger.error(`[AppServer] Process error: ${err}`);
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
      //logger.info(`[AppServer] No process to stop (startedByUs=${this.startedByUs})`);
      return;
    }

    logger.info(`[AppServer] Stopping Next.js dev server...`);

    return new Promise((resolve) => {
      const proc = this.process!;
      const killTimeout = setTimeout(() => {
        //logger.warn(`[AppServer] Force killing process`);
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

  private async forceKillPort(port: number): Promise<void> {
    try {
      const { execSync } = await import("node:child_process");
      if (process.platform === "win32") {
        // Find and kill process on port (Windows)
        const output = execSync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, { encoding: "utf-8" });
        const lines = output.trim().split("\n");
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(Number(pid))) {
            logger.info(`[AppServer] Killing PID ${pid} on port ${port}`);
            try { execSync(`taskkill /PID ${pid} /F`, { encoding: "utf-8" }); } catch { /* ignore */ }
          }
        }
      } else {
        // Unix: fuser -k
        try { execSync(`fuser -k ${port}/tcp 2>/dev/null`, { encoding: "utf-8" }); } catch { /* ignore */ }
      }
      // Wait a moment for the port to be released
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      logger.warn(`[AppServer] Could not force-kill process on port ${port}`);
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

  private async waitForHealthy(port: number, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const interval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const http = await import("node:http");
        const healthy = await new Promise<boolean>((resolve) => {
          const req = http.get(`http://localhost:${port}`, (res) => {
            let body = "";
            res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
            res.on("end", () => {
              // Must be a successful response with actual content (not just a TCP stub)
              const ok = res.statusCode !== undefined && res.statusCode < 500 && body.length > 0;
              resolve(ok);
            });
          });
          req.on("error", () => resolve(false));
          req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
          });
        });

        if (healthy) {
          logger.info(`[AppServer] Health check passed on port ${port}`);
          return true;
        }
        logger.debug(`[AppServer] Health check failed (port ${port}), retrying...`);
      } catch {
        // ignore
      }

      await new Promise((r) => setTimeout(r, interval));
    }

    logger.warn(`[AppServer] Health check did not pass within ${timeoutMs}ms`);
    return false;
  }

  isRunning(): boolean {
    return this.process !== null;
  }
}
