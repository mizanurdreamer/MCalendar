import 'dotenv/config';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
const anthropic = new Anthropic();

// Direct path to locally installed GitHub MCP server entry point
const ghServerPath = path.resolve(
  process.cwd(),
  'node_modules',
  '@modelcontextprotocol',
  'server-github',
  'dist',
  'index.js'
);

/**
 * Format MCP tools for Anthropic Messages API
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
 * Safely extract string data from MCP output
 */
function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => (typeof item === 'object' && item !== null && 'text' in item ? String((item as any).text) : ''))
    .filter(Boolean)
    .join('\n');
}

async function runCommitToAcceptanceCriteria(owner: string, repo: string, commitSha: string, issueNumber?: number) {
  // 1. Initialize GitHub MCP Server via direct local file reference
  const ghTransport = new StdioClientTransport({
    command: 'node',
    args: [ghServerPath],
    env: {
      ...process.env,
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '',
    },
  });

  const ghClient = new Client(
    { name: 'GHClient', version: '1.0.0' } as any,
    { capabilities: { tools: {} } } as any
  );

  await ghClient.connect(ghTransport);
  console.log('✅ Connected to GitHub MCP Server');

  const { tools } = await ghClient.listTools();
  const formattedTools = formatMCPToolsForClaude(tools);

  try {
    // -----------------------------------------------------------------
    // AGENT 1: Commit Analyzer (Fetch & Diff Analysis)
    // -----------------------------------------------------------------
    console.log(`🤖 [Agent 1] Fetching details for commit ${commitSha}...`);

    const commitResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      tools: formattedTools,
      messages: [
        {
          role: 'user',
          content: `Get details for commit SHA "${commitSha}" in repository "${owner}/${repo}" using the github tools.`,
        },
      ],
    });

    const toolCall = commitResponse.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
    let commitDiffText = '';

    if (toolCall) {
      const toolRes = await ghClient.callTool({
        name: toolCall.name,
        arguments: toolCall.input as Record<string, unknown>,
      });
      commitDiffText = extractText(toolRes.content);
    } else {
      throw new Error('Failed to retrieve commit data via MCP.');
    }

    // -----------------------------------------------------------------
    // AGENT 2: Acceptance Criteria & Test Suite Generator
    // -----------------------------------------------------------------
    console.log('🤖 [Agent 2] Analyzing commit diff and generating Acceptance Criteria...');

    const criteriaResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `
You are a Lead QA Engineer. Analyze the following commit diff and commit message:

${commitDiffText.substring(0, 8000)}

Generate:
1. **Feature Goal / Summary:** What was changed/implemented in simple business terms.
2. **Acceptance Criteria (Gherkin Format):** Write "Given-When-Then" scenarios covering happy paths, edge cases, and boundary conditions.
3. **Playwright Test Strategy:** List the automated tests required to validate these criteria.

Format everything nicely in Markdown.
          `,
        },
      ],
    });

    const firstBlock = criteriaResponse.content[0];
    const generatedMarkdown = firstBlock.type === 'text' ? firstBlock.text : '';

    console.log('\n--- GENERATED ACCEPTANCE CRITERIA ---\n');
    console.log(generatedMarkdown);

    // -----------------------------------------------------------------
    // AGENT 3: Reporter (Publishing back to GitHub)
    // -----------------------------------------------------------------
    if (issueNumber && issueNumber > 0) {
      console.log(`\n🤖 [Agent 3] Posting Acceptance Criteria comment to Issue/PR #${issueNumber}...`);

      const commentPayload = `
### 📋 Automated Acceptance Criteria & Test Plan
*Generated from commit \`${commitSha.substring(0, 7)}\`*

${generatedMarkdown}
      `;

      await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        tools: formattedTools,
        messages: [
          {
            role: 'user',
            content: `Call GitHub's add_issue_comment tool to add this comment to issue or pull request #${issueNumber} in repo ${owner}/${repo}:\n\n${commentPayload}`,
          },
        ],
      });

      console.log('✅ Comment published successfully to GitHub!');
    } else {
      // Save locally if no issue ID is provided
      const filename = `acceptance-criteria-${commitSha.substring(0, 7)}.md`;
      fs.writeFileSync(filename, generatedMarkdown);
      console.log(`\n📁 Saved acceptance criteria locally to: ${filename}`);
    }
  } catch (error) {
    console.error('❌ Pipeline failed:', error);
  } finally {
    await ghClient.close();
  }
}

// Pass your actual GitHub organization/user, repo name, commit SHA, and optional issue #
runCommitToAcceptanceCriteria('mizanurdreamer', 'MCalendar', '1430c7a0de0a0e7b3ca64cfa8b06c7ce46a9f77c', 2);