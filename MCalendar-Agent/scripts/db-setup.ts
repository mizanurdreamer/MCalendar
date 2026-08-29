#!/usr/bin/env tsx
/**
 * Database setup script for MCalendar Agent memory.
 *
 * Usage:
 *   npm run db:setup          Create database + schema (idempotent)
 *   npm run db:reset          Drop and recreate everything
 *
 * Reads AGENT_MEMORY_DATABASE_URL from .env (falls back to DATABASE_URL).
 */

import pg from "pg";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
dotenv.config({ path: resolve(__dirname, "..", ".env"), override: true });

const AGENT_DB_NAME = "mcalendar_agent";

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
CREATE INDEX IF NOT EXISTS idx_agent_memories_content_fts ON agent_memories USING GIN(to_tsvector('english', content));
`;

const DROP_SQL = `DROP TABLE IF EXISTS agent_memories CASCADE;`;

function parseDatabaseUrl(url: string): { host: string; port: number; user: string; password: string; database: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "5432", 10),
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1), // remove leading /
  };
}

async function databaseExists(config: { host: string; port: number; user: string; password: string }, dbName: string): Promise<boolean> {
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: "postgres", // connect to default db to check
  });

  try {
    await client.connect();
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    return result.rowCount > 0;
  } finally {
    await client.end();
  }
}

async function createDatabase(config: { host: string; port: number; user: string; password: string }, dbName: string): Promise<void> {
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: "postgres",
  });

  try {
    await client.connect();
    // Terminate existing connections to the database
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [dbName]);
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✓ Database "${dbName}" created`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(config: { host: string; port: number; user: string; password: string }, dbName: string): Promise<void> {
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: "postgres",
  });

  try {
    await client.connect();
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [dbName]);
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`✓ Database "${dbName}" dropped`);
  } finally {
    await client.end();
  }
}

async function runSchema(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });

  try {
    await client.connect();
    await client.query(SCHEMA_SQL);
    console.log("✓ Schema created (agent_memories table + indexes)");
  } finally {
    await client.end();
  }
}

async function runDrop(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });

  try {
    await client.connect();
    await client.query(DROP_SQL);
    console.log("✓ Tables dropped");
  } finally {
    await client.end();
  }
}

async function main() {
  const reset = process.argv.includes("--reset");

  // Resolve database URL
  const agentUrl = process.env.AGENT_MEMORY_DATABASE_URL;
  const fallbackUrl = process.env.DATABASE_URL;

  if (!agentUrl && !fallbackUrl) {
    console.error("✗ No database URL found. Set AGENT_MEMORY_DATABASE_URL or DATABASE_URL in .env");
    process.exit(1);
  }

  const targetUrl = agentUrl || fallbackUrl!;
  const config = parseDatabaseUrl(targetUrl);
  const dbName = config.database || AGENT_DB_NAME;

  console.log(`\nMCalendar Agent — Database Setup`);
  console.log(`Target: ${config.host}:${config.port}/${dbName}`);
  console.log(`Mode: ${reset ? "RESET (drop + recreate)" : "SETUP (idempotent)"}`);
  console.log("");

  // Check if the target URL points to a different database
  // If AGENT_MEMORY_DATABASE_URL is set, use it directly
  // Otherwise, we need to create the mcalendar_agent database
  const needsDbCreate = !agentUrl && dbName !== AGENT_DB_NAME;

  if (reset) {
    if (needsDbCreate) {
      // We're falling back to DATABASE_URL, so we need to create mcalendar_agent separately
      const baseConfig = parseDatabaseUrl(fallbackUrl!);
      await dropDatabase(baseConfig, AGENT_DB_NAME);
    }
    console.log("✓ Reset complete\n");
    return;
  }

  if (needsDbCreate) {
    // Create the agent database if it doesn't exist
    const baseConfig = parseDatabaseUrl(fallbackUrl!);
    const exists = await databaseExists(baseConfig, AGENT_DB_NAME);
    if (!exists) {
      await createDatabase(baseConfig, AGENT_DB_NAME);
    } else {
      console.log(`✓ Database "${AGENT_DB_NAME}" already exists`);
    }

    // Connect to the agent database and run schema
    const agentDbUrl = `postgresql://${baseConfig.user}:${baseConfig.password}@${baseConfig.host}:${baseConfig.port}/${AGENT_DB_NAME}`;
    await runSchema(agentDbUrl);
  } else {
    // Using AGENT_MEMORY_DATABASE_URL directly
    const exists = await databaseExists(config, dbName);
    if (!exists) {
      await createDatabase(config, dbName);
    } else {
      console.log(`✓ Database "${dbName}" already exists`);
    }
    await runSchema(targetUrl);
  }

  console.log("\n✓ Setup complete\n");
}

main().catch((err) => {
  console.error("✗ Setup failed:", err.message);
  process.exit(1);
});
