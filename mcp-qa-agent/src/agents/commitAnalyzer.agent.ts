import { anthropic, DEFAULT_MODEL } from '../clients/anthropic.js';
import { extractText } from '../utils/parsers.js';
import Anthropic from '@anthropic-ai/sdk';

export async function runCommitAnalyzer(
  owner: string,
  repo: string,
  commitSha: string,
  formattedTools: Anthropic.Tool[],
  ghClient: any
): Promise<string> {
  console.log(`🤖 [Agent 1: Commit Analyzer] Fetching diff for ${commitSha}...`);

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2000,
    tools: formattedTools,
    messages: [
      {
        role: 'user',
        content: `Get details for commit SHA "${commitSha}" in repository "${owner}/${repo}" using the github tools.`,
      },
    ],
  });

  const toolCall = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
  if (!toolCall) throw new Error('Failed to retrieve commit data via MCP.');

  const toolRes = await ghClient.callTool({
    name: toolCall.name,
    arguments: toolCall.input as Record<string, unknown>,
  });

  return extractText(toolRes.content);
}