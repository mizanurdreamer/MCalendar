import fs from "node:fs";
import path from "node:path";

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, "utf-8");
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(readFile(filePath)) as T;
}

export function writeJson(filePath: string, data: unknown): void {
  writeFile(filePath, JSON.stringify(data, null, 2));
}
