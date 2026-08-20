import 'dotenv/config';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
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

/**
 * Clean markdown code blocks from LLM code response
 */
function cleanCodeOutput(rawText: string): string {
  return rawText
    .replace(/^```(?:typescript|js|ts)?\n/i, '')
    .replace(/\n```$/i, '')
    .trim();
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
    // AGENT 2: Acceptance Criteria Generator
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
    // AGENT 3: Test Generation Agent (Generates Playwright .spec.ts)
    // -----------------------------------------------------------------
    console.log('\n🤖 [Agent 3] Generating automated Playwright TypeScript tests...');

    const testGenResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `
You are an expert Automation Engineer specializing in Playwright with TypeScript.

Based on these Acceptance Criteria and Commit details, write production-ready Playwright tests:

### Acceptance Criteria:
${generatedMarkdown}

### Commit Diff Context:
${commitDiffText.substring(0, 4000)}

Requirements:
1. Import \`test\` and \`expect\` from \`@playwright/test\`.
2. Group tests logically using \`test.describe()\`.
3. Include clear \`test('should...', async ({ page }) => { ... })\` blocks covering happy path and key edge cases.
4. Use standard Page Object patterns and robust selectors (\`getByRole\`, \`getByTestId\`, \`getByText\`).
5. Output ONLY the raw executable TypeScript code. Do not wrap in markdown or add intro/outro text.
          `,
        },
      ],
    });

    const testBlock = testGenResponse.content[0];
    const rawTestCode = testBlock.type === 'text' ? testBlock.text : '';
    const cleanTestCode = cleanCodeOutput(rawTestCode);

    // Ensure tests directory exists and save test file
    const testsDir = path.join(process.cwd(), 'tests');
    if (!fs.existsSync(testsDir)) {
      fs.mkdirSync(testsDir, { recursive: true });
    }

    const shortSha = commitSha.substring(0, 7);
    const relativeTestPath = path.join('tests', `commit-${shortSha}.spec.ts`);
    const absoluteTestPath = path.join(process.cwd(), relativeTestPath);
    
    fs.writeFileSync(absoluteTestPath, cleanTestCode);
    console.log(`✅ Generated Playwright test file: ${relativeTestPath}`);

    // -----------------------------------------------------------------
    // AGENT 4: Test Execution Agent (Runs Playwright & Captures Output)
    // -----------------------------------------------------------------
    console.log('\n🤖 [Agent 4] Executing Playwright test suite...');
    
    let testSuccess = false;
    let testOutput = '';

    try {
      // Runs Playwright headless on the generated spec file
      const { stdout, stderr } = await execPromise(`npx playwright test ${relativeTestPath}`);
      testOutput = stdout || stderr;
      testSuccess = true;
      console.log('✅ Test Execution Passed!');
    } catch (execError: any) {
      testSuccess = false;
      testOutput = execError.stdout || execError.stderr || execError.message;
      console.log('⚠️ Test Execution Failed or completed with assertions.');
    }

    // -----------------------------------------------------------------
    // AGENT 5: Reporter (Publishing Final Executive Summary)
    // -----------------------------------------------------------------
    const statusEmoji = testSuccess ? '🟢 PASSED' : '🔴 FAILED / NEEDS ATTENTION';
    
    const finalReport = `
### 📋 Automated Acceptance Criteria & Test Plan
*Generated from commit \`${shortSha}\`*

${generatedMarkdown}

---

### 🧪 Automated Playwright Test Execution
* **File:** \`${relativeTestPath}\`
* **Execution Status:** ${statusEmoji}

<details>
<summary><b>View Execution Output Log</b></summary>

\`\`\`text
${testOutput.trim().substring(0, 3000)}
\`\`\`

</details>
`;

    if (issueNumber && issueNumber > 0) {
      console.log(`\n🤖 [Agent 5] Posting execution report to GitHub Issue/PR #${issueNumber}...`);

      await ghClient.callTool({
        name: 'add_issue_comment',
        arguments: {
          owner,
          repo,
          issue_number: Number(issueNumber),
          body: finalReport,
        },
      });

      console.log(`✅ Report published successfully to Issue #${issueNumber}!`);
    } else {
      const criteriaFilename = `test-report-${shortSha}.md`;
      fs.writeFileSync(criteriaFilename, finalReport);
      console.log(`\n📁 Saved full report locally to: ${criteriaFilename}`);
    }

  } catch (error) {
    console.error('❌ Pipeline failed:', error);
  } finally {
    await ghClient.close();
  }
}

// Execution call
runCommitToAcceptanceCriteria('mizanurdreamer', 'MCalendar', '1430c7a0de0a0e7b3ca64cfa8b06c7ce46a9f77c', 0);