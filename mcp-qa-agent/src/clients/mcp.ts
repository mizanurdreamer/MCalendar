import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import Anthropic from '@anthropic-ai/sdk';

const ghServerPath = path.resolve(
  process.cwd(),
  'node_modules',
  '@modelcontextprotocol',
  'server-github',
  'dist',
  'index.js'
);

export async function createMCPClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [ghServerPath],
    env: {
      ...process.env,
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '',
    },
  });

  const client = new Client(
    { name: 'GHClient', version: '1.0.0' } as any,
    { capabilities: { tools: {} } } as any
  );

  await client.connect(transport);
  return client;
}

export function formatMCPToolsForClaude(mcpTools: any[]): Anthropic.Tool[] {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description || '',
    input_schema: {
      type: 'object',
      properties: t.inputSchema?.properties || {},
      required: t.inputSchema?.required || [],
    } as Anthropic.Tool.InputSchema,
  }));
}