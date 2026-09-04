import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { logger } from "./logger.js";

const CACHE_DIR = path.join(process.cwd(), ".cache", "repos");

function isRepoUrl(input: string): boolean {
  return /^(https?:\/\/|git@)/.test(input);
}

function extractProjectName(input: string): string {
  // https://github.com/owner/repo → "repo"
  // git@github.com:owner/repo.git → "repo"
  // D:\Projects\MCalendar\MCalendar → "MCalendar"
  const cleaned = input.replace(/\/+$/, "").replace(/\.git$/, "");
  const lastSegment = path.basename(cleaned);
  return lastSegment || "project";
}

function extractOwnerRepo(url: string): { owner: string; repo: string } | null {
  // https://github.com/owner/repo → { owner: "owner", repo: "repo" }
  // git@github.com:owner/repo.git → { owner: "owner", repo: "repo" }
  const httpsMatch = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2].replace(/\.git$/, "") };

  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+)\.git/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

function cloneRepo(url: string, targetDir: string): void {
  logger.info(`Cloning ${url} to ${targetDir}`);

  const cacheDir = path.dirname(targetDir);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  try {
    execSync(`git clone --depth 1 "${url}" "${targetDir}"`, {
      stdio: "pipe",
      timeout: 120_000,
    });
    logger.success(`Cloned successfully: ${path.basename(targetDir)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to clone ${url}: ${msg}`);
  }
}

export function resolveProjectPath(input: string): { resolvedPath: string; projectName: string; ownerRepo?: { owner: string; repo: string } } {
  const trimmed = input.trim();

  if (isRepoUrl(trimmed)) {
    const name = extractProjectName(trimmed);
    const targetDir = path.join(CACHE_DIR, name);
    const ownerRepo = extractOwnerRepo(trimmed);

    if (!fs.existsSync(targetDir)) {
      cloneRepo(trimmed, targetDir);
    } else {
      logger.info(`Using cached clone: ${targetDir}`);
    }

    return { resolvedPath: targetDir, projectName: name, ownerRepo: ownerRepo ?? undefined };
  }

  // Local path
  const resolved = path.resolve(trimmed);
  const name = extractProjectName(resolved);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Local path does not exist: ${resolved}`);
  }

  return { resolvedPath: resolved, projectName: name };
}
