import type { MemoryEntry, AgentName } from "./state.js";
import { logger } from "../utils/logger.js";

export interface MemoryStore {
  initialize(): Promise<void>;
  store(entry: MemoryEntry): Promise<void>;
  retrieve(type: MemoryEntry["type"], tags: string[], limit: number): Promise<MemoryEntry[]>;
  retrieveById(id: string): Promise<MemoryEntry | null>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<{ totalEntries: number; byType: Record<string, number> }>;
}

export class InMemoryStore implements MemoryStore {
  private entries: Map<string, MemoryEntry> = new Map();

  async initialize(): Promise<void> {
    //logger.info("[Memory] In-memory store initialized");
  }

  async store(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async retrieve(type: MemoryEntry["type"], tags: string[], limit: number): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.type === type && tags.some(t => entry.metadata.tags.includes(t))) {
        results.push(entry);
      }
    }
    return results
      .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
      .slice(0, limit);
  }

  async retrieveById(id: string): Promise<MemoryEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }

  async getStats(): Promise<{ totalEntries: number; byType: Record<string, number> }> {
    const byType: Record<string, number> = {};
    for (const entry of this.entries.values()) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }
    return { totalEntries: this.entries.size, byType };
  }
}

export function createMemoryStore(type: "local" | "postgres" = "local", databaseUrl?: string): MemoryStore {
  if (type === "postgres") {
    const { PostgresMemoryStore } = require("./postgres_memory.js");
    return new PostgresMemoryStore(databaseUrl);
  }
  return new InMemoryStore();
}