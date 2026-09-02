import type { ToolDefinition } from "../providers/types.js";
import { AGENT_NAMES } from "../utils/agent_names.js";
import { logger } from "../utils/logger.js";

export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolHandlerContext
) => Promise<string>;

export interface ToolHandlerContext {
  codebasePath: string;
  testOutputPath: string;
  testProjectPath: string;
}

// Derive AgentRole from AGENT_NAMES to keep them in sync
export const AGENT_ROLES = {
  [AGENT_NAMES.AGENT_ISSUE_ANALYZER]: "issue_analyzer",
  [AGENT_NAMES.AGENT_COMMIT_ANALYZER]: "commit_analyzer",
  [AGENT_NAMES.AGENT_TESTS_GENERATOR]: "tests_generator",
  [AGENT_NAMES.AGENT_TESTS_REVIEWER]: "tests_reviewer",
  [AGENT_NAMES.AGENT_TESTS_REPORT_GENERATOR]: "tests_report_generator",
  [AGENT_NAMES.AGENT_SUMMARIZE]: "summarize",
  [AGENT_NAMES.AGENT_CODE_FIXER]: "code_fixer",
} as const;

export type AgentRole = (typeof AGENT_ROLES)[keyof typeof AGENT_ROLES];

export interface ToolMetadata {
  category: "core" | "diagnostic" | "database" | "dev" | "mcp" | "agent";
  roles: AgentRole[];
  tags?: string[];
}

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  metadata: ToolMetadata;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(definition: ToolDefinition, handler: ToolHandler, metadata: ToolMetadata): void {
    this.tools.set(definition.name, { definition, handler, metadata });
  }

  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  getMetadata(name: string): ToolMetadata | undefined {
    return this.tools.get(name)?.metadata;
  }

  getByRole(role: AgentRole, extraTools?: string[]): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const [name, tool] of this.tools) {
      if (tool.metadata.roles.includes(role)) {
        result.push(tool.definition);
      }
    }
    // Add extra tools by name (for agent-specific tools like submit_analysis)
    if (extraTools) {
      for (const name of extraTools) {
        const tool = this.tools.get(name);
        if (tool) {
          result.push(tool.definition);
        }
      }
    }
    return result;
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolHandlerContext
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Unknown tool: ${name}`;
    }
    try {
      return await tool.handler(input, context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error executing tool "${name}": ${msg}`;
    }
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  getStats(): { total: number; byCategory: Record<string, number>; byRole: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    const byRole: Record<string, number> = {};
    for (const tool of this.tools.values()) {
      byCategory[tool.metadata.category] = (byCategory[tool.metadata.category] || 0) + 1;
      for (const role of tool.metadata.roles) {
        byRole[role] = (byRole[role] || 0) + 1;
      }
    }
    return { total: this.tools.size, byCategory, byRole };
  }
}

// Singleton registry instance
let globalRegistry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

export function resetToolRegistry(): void {
  globalRegistry = null;
}
