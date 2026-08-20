import { anthropic, DEFAULT_MODEL } from '../clients/anthropic.js';

export async function runCriteriaGenerator(commitDiffText: string): Promise<string> {
  console.log('🤖 [Agent 2: Criteria Generator] Generating Acceptance Criteria...');

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: `
You are a Lead QA Engineer. Analyze the following commit diff:

${commitDiffText.substring(0, 8000)}

Generate:
1. **Feature Goal / Summary:** Business context of changes.
2. **Acceptance Criteria (Gherkin Format):** Given-When-Then scenarios.
3. **Playwright Test Strategy:** Automation checklist.
        `,
      },
    ],
  });

  const firstBlock = response.content[0];
  return firstBlock.type === 'text' ? firstBlock.text : '';
}