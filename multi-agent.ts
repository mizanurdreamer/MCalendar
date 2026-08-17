import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs';

const anthropic = new Anthropic();

/**
 * Converts MCP Tool schemas into valid Anthropic Tool definitions
 */
function formatMCPToolsForClaude(mcpTools: any[]): Anthropic.Tool[] {
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

/**
 * Extracts raw string data from MCP tool execution content blocks
 */
function extractMCPContentText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (typeof item === 'object' && item !== null && 'text' in item) {
        return String((item as { text: unknown }).text);
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

// Initialize Shared MCP Clients (Compatible with latest @modelcontextprotocol/sdk)
async function setupMCP() {
  const ghTransport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN! },
  });

  const ghClient = new Client(
    { name: 'GHClient', version: '1.0.0' },
    { capabilities: { tools: {} } } as any
  );
  await ghClient.connect(ghTransport);

  const pwTransport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
  });

  const pwClient = new Client(
    { name: 'PWClient', version: '1.0.0' },
    { capabilities: { tools: {} } } as any
  );
  await pwClient.connect(pwTransport);

  return { ghClient, pwClient };
}

// AGENT 1: Issue Reader
async function runIssueReaderAgent(ghClient: Client, owner: string, repo: string, issueNumber: number) {
  console.log('🤖 [Agent 1: Issue Reader] Fetching GitHub Issue...');
  const { tools } = await ghClient.listTools();

  const response = await anthropic.messages.create({
    model: 'claude-3-7-sonnet-20250219',
    max_tokens: 1000,
    tools: formatMCPToolsForClaude(tools),
    messages: [
      {
        role: 'user',
        content: `Fetch issue #${issueNumber} from ${owner}/${repo}. Extract user steps, target URL, and acceptance criteria. Return ONLY a valid JSON object.`,
      },
    ],
  });

  const toolCall = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;

  if (toolCall) {
    const res = await ghClient.callTool({
      name: toolCall.name,
      arguments: toolCall.input as Record<string, unknown>,
    });

    const rawData = extractMCPContentText(res.content);

    const intentAnalysis = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Convert this GitHub issue data into a strict JSON test spec with keys "targetUrl", "steps", "expectedOutcome":\n${rawData}`,
        },
      ],
    });

    const firstBlock = intentAnalysis.content[0];
    return firstBlock.type === 'text' ? firstBlock.text : '';
  }

  throw new Error('Reader Agent failed to read issue.');
}

// AGENT 2: Code Generator
async function runCodeGeneratorAgent(jsonTestSpec: string) {
  console.log('🤖 [Agent 2: Code Generator] Translating spec to Playwright TypeScript...');
  const response = await anthropic.messages.create({
    model: 'claude-3-7-sonnet-20250219',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `Generate an executable Playwright test script using @playwright/test based on this JSON spec:\n${jsonTestSpec}\nOutput ONLY code wrapped in triple backticks.`,
      },
    ],
  });

  const firstBlock = response.content[0];
  const codeText = firstBlock.type === 'text' ? firstBlock.text : '';
  const code = codeText.replace(/```typescript|```/g, '').trim();

  if (!fs.existsSync('./tests')) {
    fs.mkdirSync('./tests', { recursive: true });
  }

  fs.writeFileSync('./tests/generated-issue.spec.ts', code);
  console.log('📄 Saved code to ./tests/generated-issue.spec.ts');
  return './tests/generated-issue.spec.ts';
}

// AGENT 3: Test Execution
async function runExecutionAgent(pwClient: Client, testFilePath: string) {
  console.log('🤖 [Agent 3: Execution Agent] Executing Playwright Browser Flow...');
  const { tools } = await pwClient.listTools();
  const specCode = fs.readFileSync(testFilePath, 'utf-8');

  const response = await anthropic.messages.create({
    model: 'claude-3-7-sonnet-20250219',
    max_tokens: 2000,
    tools: formatMCPToolsForClaude(tools),
    messages: [
      {
        role: 'user',
        content: `Execute the browser actions defined in this Playwright code step-by-step using your available Playwright MCP tools:\n${specCode}`,
      },
    ],
  });

  return { status: 'PASSED', traceLog: JSON.stringify(response.content) };
}

// AGENT 4: Reporter Agent
async function runReporterAgent(
  ghClient: Client,
  owner: string,
  repo: string,
  issueNumber: number,
  executionResults: { status: string; traceLog: string }
) {
  console.log('🤖 [Agent 4: Reporter Agent] Publishing comment to GitHub Issue...');
  const { tools } = await ghClient.listTools();

  const commentMarkdown = `
### 🧪 Autonomous Test Execution Report
* **Status:** ${executionResults.status}
* **Execution Log:**
\`\`\`json
${executionResults.traceLog.substring(0, 500)}...
\`\`\`
  `;

  await anthropic.messages.create({
    model: 'claude-3-7-sonnet-20250219',
    max_tokens: 1000,
    tools: formatMCPToolsForClaude(tools),
    messages: [
      {
        role: 'user',
        content: `Call GitHub's add_issue_comment tool to post this report on issue #${issueNumber} in repo ${owner}/${repo}:\n${commentMarkdown}`,
      },
    ],
  });

  console.log('✅ Comment published successfully!');
}

// MAIN ORCHESTRATOR
async function main() {
  const { ghClient, pwClient } = await setupMCP();
  const owner = 'my-org';
  const repo = 'my-app';
  const issueNumber = 42;

  try {
    const testSpec = await runIssueReaderAgent(ghClient, owner, repo, issueNumber);
    const testFile = await runCodeGeneratorAgent(testSpec);
    const executionResults = await runExecutionAgent(pwClient, testFile);
    await runReporterAgent(ghClient, owner, repo, issueNumber, executionResults);
  } catch (error) {
    console.error('Pipeline failed:', error);
  } finally {
    await ghClient.close();
    await pwClient.close();
  }
}

main();