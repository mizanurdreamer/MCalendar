import { CodebaseReader } from "./reader.js";

export function buildProjectMap(reader: CodebaseReader): string {
  const lines: string[] = [];

  lines.push("## PROJECT STRUCTURE");
  lines.push(reader.getProjectStructure());
  lines.push("");

  lines.push("## API ROUTES");
  for (const route of reader.getApiRoutes()) {
    lines.push(`- ${route}`);
  }
  lines.push("");

  lines.push("## PAGE ROUTES");
  for (const route of reader.getPageRoutes()) {
    lines.push(`- ${route}`);
  }
  lines.push("");

  lines.push("## PRISMA MODELS");
  for (const model of reader.getPrismaModels()) {
    lines.push(`- ${model}`);
  }

  return lines.join("\n");
}
