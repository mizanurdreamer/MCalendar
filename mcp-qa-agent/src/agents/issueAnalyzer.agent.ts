import Anthropic from '@anthropic-ai/sdk';

import { anthropic, DEFAULT_MODEL } from '../clients/anthropic.js';


export interface IssueAnalysisResult {
  title: string;
  body: string;
  targetFeature: string;
  acceptanceCriteria: string[];
}

export async function runIssueAnalyzer(
  owner: string,
  repo: string,
  issueNumber: number,
  formattedTools: Anthropic.Tool[],
  ghClient: any
): Promise<IssueAnalysisResult> {
  console.log(`🤖 [Agent 0: Issue Analyzer] Fetching details for Issue #${issueNumber}...`);

  // 1. Fetch raw issue content via GitHub MCP
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2000,
    tools: formattedTools,
    messages: [
      {
        role: 'user',
        content: `Use GitHub tools to fetch issue #${issueNumber} from repository "${owner}/${repo}".`,
      },
    ],
  });

  const toolCall = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
  if (!toolCall) throw new Error(`Failed to fetch issue #${issueNumber} via MCP.`);

  const toolRes = await ghClient.callTool({
    name: toolCall.name,
    arguments: toolCall.input as Record<string, unknown>,
  });

  const issueText = JSON.stringify(toolRes.content);

  // 2. Synthesize structured requirements from issue text
  console.log(`🤖 [Agent 0: Issue Analyzer] Extracting requirements & target feature...`);

  const structuredResponse = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `
Analyze the following GitHub issue text and extract structured test requirements.

### Raw Issue:
${issueText}

Return a valid JSON object matching this TypeScript interface:
{
  "title": string,
  "body": string,
  "targetFeature": string, // e.g. "Client Management", "Auth", "Bookings"
  "acceptanceCriteria": string[]
}

Output ONLY valid raw JSON.
        `,
      },
    ],
  });

  const rawJson = structuredResponse.content[0].type === 'text' ? structuredResponse.content[0].text : '{}';
  const cleanedJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();

  return JSON.parse(cleanedJson) as IssueAnalysisResult;
}