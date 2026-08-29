import pg from "pg";
import type { MemoryEntry, AgentName } from "./state.js";
import type { MemoryStore } from "./memory.js";
import { logger } from "../utils/logger.js";

const { Pool } = pg;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  project TEXT NOT NULL,
  agent TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  tags JSONB NOT NULL DEFAULT '[]',
  timestamp BIGINT NOT NULL,
  related_issue INTEGER,
  related_commit TEXT,
  source TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_type ON agent_memories(type);
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent);
CREATE INDEX IF NOT EXISTS idx_agent_memories_project ON agent_memories(project);
CREATE INDEX IF NOT EXISTS idx_agent_memories_tags ON agent_memories USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_agent_memories_timestamp ON agent_memories(timestamp DESC);

-- Full-text search index on content
CREATE INDEX IF NOT EXISTS idx_agent_memories_content_fts ON agent_memories USING GIN(to_tsvector('english', content));
`;

export class PostgresMemoryStore implements MemoryStore {
  private pool: pg.Pool;
  private initialized = false;

  constructor(databaseUrl?: string) {
    const url = databaseUrl || process.env.AGENT_MEMORY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) {
      throw new Error("PostgresMemoryStore requires AGENT_MEMORY_DATABASE_URL or DATABASE_URL");
    }
    this.pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(SCHEMA_SQL);
        this.initialized = true;
        logger.success("[PostgresMemory] Schema initialized");
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error(`[PostgresMemory] Schema initialization failed: ${err}`);
      throw err;
    }
  }

  async store(entry: MemoryEntry): Promise<void> {
    const sql = `
      INSERT INTO agent_memories (id, type, content, project, agent, success, tags, timestamp, related_issue, related_commit, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        tags = EXCLUDED.tags,
        access_count = agent_memories.access_count
    `;

    try {
      await this.pool.query(sql, [
        entry.id,
        entry.type,
        entry.content,
        entry.metadata.project,
        entry.metadata.agent,
        entry.metadata.success,
        JSON.stringify(entry.metadata.tags),
        entry.metadata.timestamp,
        entry.metadata.relatedIssue ?? null,
        entry.metadata.relatedCommit ?? null,
        entry.metadata.source ?? null,
      ]);
    } catch (err) {
      logger.warn(`[PostgresMemory] Store failed: ${err}`);
    }
  }

  async retrieve(type: MemoryEntry["type"], tags: string[], limit: number): Promise<MemoryEntry[]> {
    const sql = `
      SELECT * FROM agent_memories
      WHERE type = $1 AND tags ?| $2
      ORDER BY timestamp DESC
      LIMIT $3
    `;

    try {
      const result = await this.pool.query(sql, [type, tags, limit]);
      const entries = result.rows.map(this.rowToEntry);

      // Update access counts
      const ids = entries.map((e: MemoryEntry) => e.id);
      if (ids.length > 0) {
        await this.pool.query(
          `UPDATE agent_memories SET access_count = access_count + 1, last_accessed_at = $1 WHERE id = ANY($2)`,
          [Date.now(), ids]
        );
      }

      return entries;
    } catch (err) {
      logger.warn(`[PostgresMemory] Retrieve failed: ${err}`);
      return [];
    }
  }

  async retrieveById(id: string): Promise<MemoryEntry | null> {
    const sql = `SELECT * FROM agent_memories WHERE id = $1`;
    try {
      const result = await this.pool.query(sql, [id]);
      if (result.rows.length === 0) return null;
      return this.rowToEntry(result.rows[0]);
    } catch (err) {
      logger.warn(`[PostgresMemory] RetrieveById failed: ${err}`);
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.pool.query(`DELETE FROM agent_memories WHERE id = $1`, [id]);
    } catch (err) {
      logger.warn(`[PostgresMemory] Delete failed: ${err}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.pool.query(`DELETE FROM agent_memories`);
      logger.info("[PostgresMemory] Cleared all memories");
    } catch (err) {
      logger.warn(`[PostgresMemory] Clear failed: ${err}`);
    }
  }

  async getStats(): Promise<{ totalEntries: number; byType: Record<string, number> }> {
    try {
      const totalResult = await this.pool.query(`SELECT COUNT(*) as count FROM agent_memories`);
      const totalEntries = parseInt(totalResult.rows[0].count, 10);

      const typeResult = await this.pool.query(`SELECT type, COUNT(*) as count FROM agent_memories GROUP BY type`);
      const byType: Record<string, number> = {};
      for (const row of typeResult.rows) {
        byType[row.type] = parseInt(row.count, 10);
      }

      return { totalEntries, byType };
    } catch (err) {
      logger.warn(`[PostgresMemory] GetStats failed: ${err}`);
      return { totalEntries: 0, byType: {} };
    }
  }

  async searchByContent(query: string, limit: number = 5): Promise<MemoryEntry[]> {
    const sql = `
      SELECT *, ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
      FROM agent_memories
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC, timestamp DESC
      LIMIT $2
    `;

    try {
      const result = await this.pool.query(sql, [query, limit]);
      return result.rows.map(this.rowToEntry);
    } catch (err) {
      logger.warn(`[PostgresMemory] SearchByContent failed: ${err}`);
      return [];
    }
  }

  async getLeastAccessed(limit: number = 100): Promise<MemoryEntry[]> {
    const sql = `
      SELECT * FROM agent_memories
      ORDER BY access_count ASC, timestamp ASC
      LIMIT $1
    `;
    try {
      const result = await this.pool.query(sql, [limit]);
      return result.rows.map(this.rowToEntry);
    } catch (err) {
      logger.warn(`[PostgresMemory] GetLeastAccessed failed: ${err}`);
      return [];
    }
  }

  async evictLeastAccessed(keepCount: number): Promise<number> {
    const sql = `
      DELETE FROM agent_memories
      WHERE id NOT IN (
        SELECT id FROM agent_memories
        ORDER BY access_count DESC, timestamp DESC
        LIMIT $1
      )
    `;
    try {
      const result = await this.pool.query(sql, [keepCount]);
      const evicted = result.rowCount ?? 0;
      if (evicted > 0) {
        logger.info(`[PostgresMemory] Evicted ${evicted} least-accessed memories`);
      }
      return evicted;
    } catch (err) {
      logger.warn(`[PostgresMemory] EvictLeastAccessed failed: ${err}`);
      return 0;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      type: row.type,
      content: row.content,
      metadata: {
        project: row.project,
        agent: row.agent as AgentName,
        success: row.success,
        tags: Array.isArray(row.tags) ? row.tags : JSON.parse(row.tags || "[]"),
        timestamp: Number(row.timestamp),
        relatedIssue: row.related_issue ?? undefined,
        relatedCommit: row.related_commit ?? undefined,
        source: row.source ?? undefined,
      },
    };
  }
}
