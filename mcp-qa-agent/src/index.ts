import 'dotenv/config';
import { createMCPClient, formatMCPToolsForClaude } from './clients/mcp.js';
import { runCommitAnalyzer } from './agents/commitAnalyzer.agent.js';
import { runFeatureAnalyzer } from './agents/featureAnalyzer.agent.js'
import { runCriteriaGenerator } from './agents/criteriaGenerator.agent.js';
import { runTestGenerator } from './agents/testGenerator.agent.js';
import { runTestExecutor } from './agents/testExecutor.agent.js';
import { runReporter } from './agents/reporter.agent.js';

async function main(owner: string, repo: string, commitSha: string, issueNumber?: number) {
  const ghClient = await createMCPClient();
  console.log('✅ Connected to GitHub MCP Server');
  console.log(repo + " repo");
  try {
    const { tools } = await ghClient.listTools();
    const formattedTools = formatMCPToolsForClaude(tools);

    const shortSha = commitSha.substring(0, 7);

    // Orchestrate Multi-Agent Pipeline
    //const diffText = await runCommitAnalyzer(owner, repo, commitSha, formattedTools, ghClient);
    // 1. Fetch feature code directly from repo
   // const featureCode = await runFeatureAnalyzer(owner, repo, "Clients", formattedTools, ghClient);
   // const criteriaMarkdown = await runCriteriaGenerator(featureCode);
    //const testPath = await runTestGenerator(criteriaMarkdown, featureCode, shortSha,repo);
   const testPath ="/Mcalendar/tests/commit-clients.spec.ts"
    const execResult = await runTestExecutor(testPath,repo);
    const criteriaMarkdown = "";
    await runReporter(owner, repo, issueNumber, shortSha, criteriaMarkdown, testPath, execResult, ghClient);

  } catch (error) {
    console.error('❌ Pipeline failed:', error);
  } finally {
    await ghClient.close();
  }
}

// Execute pipeline
//main('mizanurdreamer', 'MCalendar', '1430c7a0de0a0e7b3ca64cfa8b06c7ce46a9f77c', 0);
main('mizanurdreamer', 'MCalendar', 'clients', 0);