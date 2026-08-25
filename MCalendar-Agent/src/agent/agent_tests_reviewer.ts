import type { AgentConfig } from "../providers/types.js";
import { getTaskProvider, getTaskProviderName, getTaskModel } from "../providers/registry.js";
import type { CodebaseReader } from "../codebase/reader.js";
import type { PlaywrightRunner } from "../test_runner/playwright.js";
import { runAgentLoop } from "../engine/agent_runner_engine.js";
import type { SharedContext } from "../engine/shared_context.js";
import { buildPrompt } from "../prompts/index.js";
import { logger } from "../utils/logger.js";
import { AGENT_NAMES } from "../utils/agent_names.js";

export interface RetryAttempt {
  attempt: number;
  errors: string[];
  analysis?: string;
}

export async function analyzeTestError(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  codebasePath: string,
  testFilename: string,
  testContent: string,
  errors: string[],
  retryHistory: RetryAttempt[],
  projectName: string,
  maxIterations?: number,
  context?: SharedContext
): Promise<string> {
  const agentName = AGENT_NAMES.TESTS_REVIEWER;
  const provider = getTaskProvider(agentName, agentConfig);
  logger.task(agentName, `analyzing error (attempt ${retryHistory.length + 1})`);

  const historyContext = retryHistory.length > 0
    ? `\n\nPREVIOUS ATTEMPTS:\n${retryHistory.map((h, i) =>
      `- Attempt ${h.attempt}: ${h.analysis ?? "No analysis"}\n  Errors: ${h.errors.join(", ")}`
    ).join("\n")}`
    : "";

  const structureContext = context?.projectContext?.projectStructure
    ? `\n\nCURRENT PROJECT STRUCTURE:\n${context.projectContext.projectStructure}`
    : "";

  const userMessage = `Analyze this test failure and explain WHY it's failing and WHAT needs to be fixed.

Filename: ${testFilename}

Test file:
\`\`\`typescript
${testContent}
\`\`\`

Errors:
${errors.join("\n\n")}
${historyContext}${structureContext}

Respond with a CONCISE analysis:
1. Root cause (what exactly is wrong)
2. What to change (specific fix instructions)
3. You may explore the project with read_file/list_directory if you need more context.`;

  const systemPrompt = buildPrompt({
    agentType: "tests_reviewer",
    projectName,
    context,
  });

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      codebasePath,
      maxTokens: agentConfig[agentName]?.maxTokens,
      temperature: agentConfig[agentName]?.temperature,
      maxRetries: context?.maxRetries,
    },
    systemPrompt,
    userMessage,
    maxIterations,
    agentName
  );

  logger.success("Error analysis complete");
  logger.info(`Analysis: ${result.slice(0, 300)}`);
  return result;
}

export async function reviewTests(
  agentConfig: AgentConfig,
  reader: CodebaseReader,
  runner: PlaywrightRunner,
  testOutputPath: string,
  codebasePath: string,
  testFilename: string,
  testContent: string,
  errors: string[],
  context: string,
  projectName: string,
  maxIterations?: number,
  sharedContext?: SharedContext
): Promise<string> {
  const agentName = AGENT_NAMES.TESTS_REVIEWER;
  const provider = getTaskProvider(agentName, agentConfig);
  logger.task(agentName, `${getTaskProviderName(agentName, agentConfig)}/${getTaskModel(agentName, agentConfig)}`);

  const systemPrompt = buildPrompt({
    agentType: "tests_reviewer",
    projectName,
    context: sharedContext,
  });

  const structureContext = sharedContext?.projectContext?.projectStructure
    ? `\n\nCURRENT PROJECT STRUCTURE:\n${sharedContext.projectContext.projectStructure}`
    : "";

  const userMessage = `Fix this test.

Filename: ${testFilename}

Test file:
\`\`\`typescript
${testContent}
\`\`\`

Errors:
${errors.join("\n\n")}

Analysis:
${context}${structureContext}

You may explore the project with read_file/list_directory if you need more context.
Use the write_test_file tool to save the fixed test.`;

  const result = await runAgentLoop(
    {
      provider,
      reader,
      runner,
      testOutputPath,
      codebasePath,
      maxTokens: agentConfig[agentName]?.maxTokens,
      temperature: agentConfig[agentName]?.temperature,
      maxRetries: sharedContext?.maxRetries,
    },
    systemPrompt,
    userMessage,
    maxIterations,
    agentName
  );

  logger.success("Review complete");
  logger.info(`Fix result: ${result.slice(0, 300)}`);
  return result;
}
