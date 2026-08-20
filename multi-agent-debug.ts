import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testConnection() {
  // 1. Verify Token
  console.log('1. Checking Environment Variables...');
  if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    console.error('❌ ERROR: GITHUB_PERSONAL_ACCESS_TOKEN is missing or undefined in your .env file!');
    return;
  }
  console.log('   ✅ GITHUB_PERSONAL_ACCESS_TOKEN is present.');

  // 2. Verify File Path
  const ghServerPath = path.resolve(process.cwd(), 'node_modules', '@modelcontextprotocol', 'server-github', 'dist', 'index.js');
  console.log('\n2. Checking MCP Server file path...');
  console.log('   Path:', ghServerPath);
  if (!fs.existsSync(ghServerPath)) {
    console.error('❌ ERROR: File does not exist at path! Run: npm install -D @modelcontextprotocol/server-github');
    return;
  }
  console.log('   ✅ File exists on disk.');

  // 3. Attempt Execution
  console.log('\n3. Spawning background process...');
  const ghTransport = new StdioClientTransport({
    command: 'node',
    args: [ghServerPath],
    env: {
      ...process.env, // 👈 Passes full system environment (PATH, SYSTEMROOT, etc.)
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
    },
  });

  ghTransport.onerror = (err) => {
    console.error('❌ Transport Error details:', err);
  };

  try {
    await ghTransport.start();
    console.log('🚀 SUCCESS: Connected to GitHub MCP Server clean and clear!');
    await ghTransport.close();
  } catch (err) {
    console.error('❌ Process launch failed with error:', err);
  }
}

testConnection();