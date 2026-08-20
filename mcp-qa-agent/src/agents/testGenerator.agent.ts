import path from 'path';
import fs from 'fs';
import { anthropic, DEFAULT_MODEL } from '../clients/anthropic.js';
import { cleanCodeOutput } from '../utils/parsers.js';

export async function runTestGenerator(
  generatedMarkdown: string,
  commitDiffText: string,
  shortSha: string,
  repo: string
): Promise<string> {
  console.log('\n🤖 [Agent 3: Test Generator] Writing Playwright tests...');
   console.log(repo + " repo");

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 50000,
    messages: [
      {
        role: 'user',
        content: `
You are an expert Playwright Automation Engineer. Write TypeScript tests based on:

### Acceptance Criteria:
${generatedMarkdown}

### Commit Diff:
${commitDiffText.substring(0, 4000)}

Output ONLY raw executable TypeScript code. No markdown code blocks.
        `,
      },
    ],
  });

  const testBlock = response.content[0];
  const rawCode = testBlock.type === 'text' ? testBlock.text : '';
  const cleanCode = cleanCodeOutput(rawCode);

  const testsDir = path.join(process.cwd(), 'tests');
  if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true });

  const relativePath = `${repo}/tests/commit-${shortSha}.spec.ts`;
  fs.writeFileSync(path.join(process.cwd(), relativePath), cleanCode);
  
  console.log(`✅ Saved test suite to: ${relativePath}`);
  return relativePath;
}