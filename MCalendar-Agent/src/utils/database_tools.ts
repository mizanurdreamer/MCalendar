import type { ToolDefinition } from "../providers/types.js";
import { logger } from "./logger.js";

let databaseUrl = "";

export function setDatabaseUrl(url: string) {
  databaseUrl = url;
}

export function getDatabaseToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "database_schema",
      description: "List all tables and their columns in the database. Returns schema information.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Specific table name (optional, returns all tables if empty)" },
        },
      },
    },
    {
      name: "database_insert",
      description: "Insert a row into a database table. Returns the inserted row.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name" },
          data: { type: "string", description: "JSON object of column:value pairs to insert" },
        },
        required: ["table", "data"],
      },
    },
    {
      name: "database_cleanup",
      description: "Delete test data from database tables. Use to reset test state.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name to clean" },
          condition: { type: "string", description: "WHERE condition (e.g., \"email LIKE 'test%'\"). If empty, deletes all rows." },
        },
        required: ["table"],
      },
    },
  ];
}

export async function executeDatabaseTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  if (!databaseUrl) return "Error: DATABASE_URL not configured";

  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      switch (name) {
        case "database_schema": {
          const table = input.table as string | undefined;
          if (table) {
            const result = await client.query(
              `SELECT column_name, data_type, is_nullable, column_default
               FROM information_schema.columns
               WHERE table_name = $1
               ORDER BY ordinal_position`,
              [table]
            );
            return JSON.stringify({ table, columns: result.rows }, null, 2);
          } else {
            const tables = await client.query(
              `SELECT table_name FROM information_schema.tables
               WHERE table_schema = 'public'
               ORDER BY table_name`
            );
            const schema: Record<string, unknown[]> = {};
            for (const row of tables.rows) {
              const cols = await client.query(
                `SELECT column_name, data_type FROM information_schema.columns
                 WHERE table_name = $1 ORDER BY ordinal_position`,
                [row.table_name]
              );
              schema[row.table_name as string] = cols.rows;
            }
            return JSON.stringify(schema, null, 2);
          }
        }

        case "database_insert": {
          const table = input.table as string;
          const data = JSON.parse(input.data as string);
          const columns = Object.keys(data);
          const values = Object.values(data);
          const placeholders = columns.map((_, i) => `$${i + 1}`);

          const result = await client.query(
            `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
            values
          );
          return JSON.stringify({ inserted: result.rows[0] }, null, 2);
        }

        case "database_cleanup": {
          const table = input.table as string;
          const condition = input.condition as string | undefined;
          const query = condition
            ? `DELETE FROM ${table} WHERE ${condition}`
            : `DELETE FROM ${table}`;
          const result = await client.query(query);
          return `Deleted ${result.rowCount} rows from ${table}`;
        }

        default:
          return `Unknown database tool: ${name}`;
      }
    } finally {
      await client.end();
    }
  } catch (err) {
    return `Database error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
