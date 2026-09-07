import { CodebaseReader } from "../codebase/reader.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../utils/logger.js";

export interface ProjectContext {
  framework: string;
  testRunner: string;
  dependencies: Record<string, string>;
  dataModels: string;
  apiRoutes: string[];
  projectStructure: string;
  existingTestPatterns: string;
  testUtils: string;
  discoveredAt: number;
}

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Discover project context by scanning the codebase.
 */
export async function discoverProjectContext(
  reader: CodebaseReader,
  codebasePath: string,
  testProjectPath: string
): Promise<ProjectContext> {
  const context: ProjectContext = {
    framework: "unknown",
    testRunner: "unknown",
    dependencies: {},
    dataModels: "",
    apiRoutes: [],
    projectStructure: "",
    existingTestPatterns: "",
    testUtils: "",
    discoveredAt: Date.now(),
  };

  try {
    // 1. Read package.json
    const pkgContent = reader.readFile("package.json");
    if (!pkgContent.startsWith("[File not found")) {
      const pkg = JSON.parse(pkgContent);
      context.dependencies = pkg.dependencies || {};

      // Detect framework
      const deps = Object.keys(context.dependencies);
      if (deps.includes("next")) context.framework = "nextjs";
      else if (deps.includes("react")) context.framework = "react";
      else if (deps.includes("vue")) context.framework = "vue";
      else if (deps.includes("angular")) context.framework = "angular";
      else if (deps.includes("express")) context.framework = "express";
      else if (deps.includes("fastify")) context.framework = "fastify";
      else context.framework = "node";

      // Detect test runner
      const devDeps = Object.keys(pkg.devDependencies || {});
      if (deps.includes("@playwright/test") || devDeps.includes("@playwright/test")) {
        context.testRunner = "playwright";
      } else if (devDeps.includes("jest") || deps.includes("jest")) {
        context.testRunner = "jest";
      } else if (devDeps.includes("vitest") || deps.includes("vitest")) {
        context.testRunner = "vitest";
      } else if (devDeps.includes("mocha") || deps.includes("mocha")) {
        context.testRunner = "mocha";
      }
    }

    // 2. Project structure (limited depth)
    context.projectStructure = reader.getProjectStructure();

    // 3. Detect API routes (Next.js app directory or pages directory)
    const appDir = reader.listDirectory("app");
    const pagesDir = reader.listDirectory("pages");
    const srcAppDir = reader.listDirectory("src/app");
    const srcPagesDir = reader.listDirectory("src/pages");

    const routeDirs = [...appDir, ...pagesDir, ...srcAppDir, ...srcPagesDir];
    context.apiRoutes = routeDirs.filter(f => !f.startsWith("_") && !f.startsWith("."));

    // 4. Detect data models (prisma, drizzle, typeorm, mongoose)
    const prismaSchema = reader.readFile("prisma/schema.prisma");
    const drizzleConfig = reader.readFile("drizzle.config.ts");
    const typeormConfig = reader.readFile("ormconfig.json");

    if (!prismaSchema.startsWith("[File not found")) {
      context.dataModels = `Prisma: ${prismaSchema.slice(0, 1000)}`;
    } else if (!drizzleConfig.startsWith("[File not found")) {
      context.dataModels = "Drizzle ORM detected";
    } else if (!typeormConfig.startsWith("[File not found")) {
      context.dataModels = "TypeORM detected";
    }

    // 5. Read existing test patterns from test project
    const testReader = new CodebaseReader(testProjectPath);
    const testFiles = testReader.listDirectory("tests");
    if (testFiles.length > 0) {
      const firstTest = testFiles.find(f => f.endsWith(".spec.ts") || f.endsWith(".test.ts"));
      if (firstTest) {
        const testContent = testReader.readFile(`tests/${firstTest}`);
        if (!testContent.startsWith("[File not found")) {
          // Extract imports and describe blocks as patterns
          const importLines = testContent.split("\n").filter(l => l.startsWith("import")).slice(0, 5);
          const describeMatch = testContent.match(/describe\(['"](.*?)['"]/);
          context.existingTestPatterns = `Imports:\n${importLines.join("\n")}\nDescribe: ${describeMatch?.[1] || "N/A"}`;
        }
      }

      // Find test utilities
      const utilsFiles = testReader.listDirectory("utils");
      const helpers = utilsFiles.filter(f => f.includes("helper") || f.includes("util") || f.includes("fixture"));
      if (helpers.length > 0) {
        const utilContent = testReader.readFile(`utils/${helpers[0]}`);
        if (!utilContent.startsWith("[File not found")) {
          context.testUtils = utilContent.slice(0, 1000);
        }
      }
    }
  } catch (err) {
    logger.warn(`[ProjectContext] Discovery error: ${err}`);
  }

  return context;
}

/**
 * Save project context to disk for caching.
 */
export function saveProjectContextToDisk(
  context: ProjectContext,
  projectName: string,
  stateDir: string = "state"
): string | null {
  try {
    const dir = path.resolve(stateDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filename = `project-context-${projectName}.json`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(context, null, 2), "utf-8");
    logger.info(`[ProjectContext] Saved to ${filePath}`);
    return filePath;
  } catch (err) {
    logger.warn(`[ProjectContext] Failed to save: ${err}`);
    return null;
  }
}

/**
 * Load project context from disk if cached and fresh.
 * Checks both age (< 24h) and whether package.json has been modified since discovery.
 */
export function loadProjectContextFromDisk(
  projectName: string,
  stateDir: string = "state",
  codebasePath?: string
): ProjectContext | null {
  try {
    const filename = `project-context-${projectName}.json`;
    const filePath = path.join(path.resolve(stateDir), filename);

    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, "utf-8");
    if (!content || content.trim() === "") {
      logger.warn(`[ProjectContext] Cache file empty, ignoring`);
      return null;
    }

    let context: ProjectContext;
    try {
      context = JSON.parse(content);
    } catch (parseErr) {
      logger.warn(`[ProjectContext] Cache file corrupted, ignoring: ${parseErr}`);
      return null;
    }

    // Validate required fields exist
    if (!context.discoveredAt || !context.framework || !context.projectStructure) {
      logger.warn(`[ProjectContext] Cache missing required fields, ignoring`);
      return null;
    }

    // Check if cache is fresh (< 24h)
    const age = Date.now() - context.discoveredAt;
    if (age > CACHE_MAX_AGE_MS) {
      logger.info(`[ProjectContext] Cache stale (${Math.round(age / 3600000)}h old)`);
      return null;
    }

    // Check if package.json has been modified since discovery
    if (codebasePath) {
      const pkgPath = path.join(codebasePath, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkgMtime = fs.statSync(pkgPath).mtimeMs;
        if (pkgMtime > context.discoveredAt) {
          logger.info(`[ProjectContext] package.json modified since cache, re-discovering`);
          return null;
        }
      }
    }

    logger.info(`[ProjectContext] Loaded cache (${Math.round(age / 60000)}m old)`);
    return context;
  } catch (err) {
    logger.warn(`[ProjectContext] Failed to load cache: ${err}`);
    return null;
  }
}

/**
 * Generate a plain-text project exploration summary from a ProjectContext.
 * This replaces the old exploreProject() methods in agents.
 */
export function generateProjectExplorationText(context: ProjectContext): string {
  const lines: string[] = [];

  lines.push(`Framework: ${context.framework}`);
  lines.push(`Test Runner: ${context.testRunner}`);

  const deps = Object.keys(context.dependencies);
  if (deps.length > 0) {
    lines.push(`Dependencies: ${deps.slice(0, 20).join(", ")}${deps.length > 20 ? ` (+${deps.length - 20} more)` : ""}`);
  }

  if (context.dataModels) {
    lines.push(`Data Models: ${context.dataModels.slice(0, 200)}`);
  }

  if (context.apiRoutes.length > 0) {
    lines.push(`API Routes: ${context.apiRoutes.join(", ")}`);
  }

  if (context.existingTestPatterns) {
    lines.push(`Existing Test Patterns:\n${context.existingTestPatterns}`);
  }

  if (context.testUtils) {
    lines.push(`Test Utils:\n${context.testUtils.slice(0, 500)}`);
  }

  // Include truncated project structure
  if (context.projectStructure) {
    const structureLines = context.projectStructure.split("\n").slice(0, 50);
    lines.push(`Project Structure:\n${structureLines.join("\n")}`);
  }

  return lines.join("\n\n");
}
