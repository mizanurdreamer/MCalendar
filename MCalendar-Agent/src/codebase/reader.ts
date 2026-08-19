import fs from "node:fs";
import path from "node:path";

export class CodebaseReader {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  readFile(relativePath: string): string {
    const fullPath = path.join(this.basePath, relativePath);
    if (!fs.existsSync(fullPath)) return `[File not found: ${relativePath}]`;
    if (fs.statSync(fullPath).isDirectory()) {
      return `[Error: "${relativePath}" is a directory, not a file. Use list_directory to list its contents.]`;
    }
    return fs.readFileSync(fullPath, "utf-8");
  }

  listDirectory(relativePath: string): string[] {
    const fullPath = path.join(this.basePath, relativePath);
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath);
  }

  getProjectStructure(): string {
    const lines: string[] = [];
    const ignore = new Set(["node_modules", ".git", "dist", ".next", "playwright-report"]);

    const walk = (dir: string, prefix = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (let i = 0; i < sorted.length; i++) {
        const entry = sorted[i];
        if (ignore.has(entry.name)) continue;
        if (entry.name === ".env" || entry.name === ".env.local") continue;

        const isLast = i === sorted.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const childPrefix = isLast ? "    " : "│   ";

        if (entry.isDirectory()) {
          lines.push(`${prefix}${connector}${entry.name}/`);
          walk(path.join(dir, entry.name), prefix + childPrefix);
        } else {
          lines.push(`${prefix}${connector}${entry.name}`);
        }
      }
    };

    walk(this.basePath);
    return lines.join("\n");
  }

  getApiRoutes(): string[] {
    const apiDir = path.join(this.basePath, "app", "api");
    if (!fs.existsSync(apiDir)) return [];

    const routes: string[] = [];
    const walk = (dir: string, prefix = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), `${prefix}/${entry.name}`);
        } else if (entry.name === "route.ts") {
          const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
          const methods = content.match(/export (async )?function (GET|POST|PATCH|DELETE|PUT)/g)
            ?.map((m) => m.replace(/export (async )?function /, "")) ?? [];
          routes.push(`${prefix} [${methods.join(", ")}]`);
        }
      }
    };

    walk(apiDir);
    return routes;
  }

  getPageRoutes(): string[] {
    const appDir = path.join(this.basePath, "app");
    if (!fs.existsSync(appDir)) return [];

    const routes: string[] = [];
    const walk = (dir: string, prefix = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith("(") || entry.name === "api") continue;
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), `${prefix}/${entry.name}`);
        } else if (entry.name === "page.tsx") {
          routes.push(prefix || "/");
        }
      }
    };

    walk(appDir);
    return routes;
  }

  getPrismaModels(): string[] {
    const schemaPath = path.join(this.basePath, "prisma", "schema.prisma");
    if (!fs.existsSync(schemaPath)) return [];

    const content = fs.readFileSync(schemaPath, "utf-8");
    const models: string[] = [];
    const modelRegex = /^model (\w+) \{/gm;
    let match;
    while ((match = modelRegex.exec(content)) !== null) {
      models.push(match[1]);
    }
    return models;
  }
}
