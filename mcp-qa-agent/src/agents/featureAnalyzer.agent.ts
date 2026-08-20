// src/agents/commitAnalyzer.agent.ts
import { anthropic, DEFAULT_MODEL } from '../clients/anthropic.js';
import { extractText } from '../utils/parsers.js';
import Anthropic from '@anthropic-ai/sdk';
export async function runFeatureAnalyzer(
  owner: string,
  repo: string,
  featureName: string,
  formattedTools: Anthropic.Tool[],
  ghClient: any
): Promise<string> {
  console.log(`🤖 [Agent 1] Searching repository for "${featureName}" feature files...`);

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 3000,
    tools: formattedTools,
    messages: [
      {
        role: 'user',
        content: `Search for files and code related to the "${featureName}" feature in repository "${owner}/${repo}" using GitHub tools. Get contents of relevant API routes, components, or controller files.`,
      },
    ],
  });

  const toolCall = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
  if (!toolCall) throw new Error(`Failed to retrieve code for feature: ${featureName}`);

  const toolRes = await ghClient.callTool({
    name: toolCall.name,
    arguments: toolCall.input as Record<string, unknown>,
  });

  return extractText(toolRes.content);
}