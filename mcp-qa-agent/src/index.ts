import 'dotenv/config';
import { createMCPClient, formatMCPToolsForClaude } from './clients/mcp.js';
import { runIssueAnalyzer } from './agents/issueAnalyzer.agent.js';
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
    const featureCode = await runFeatureAnalyzer(owner, repo, commitSha, formattedTools, ghClient);
    const criteriaMarkdown = await runCriteriaGenerator(featureCode);
    const testPath = await runTestGenerator(criteriaMarkdown, featureCode, shortSha,repo);
   //const testPath ="/Mcalendar/tests/commit-clients.spec.ts"
    const execResult = await runTestExecutor(testPath,repo);
   // const criteriaMarkdown = "";
    await runReporter(owner, repo, issueNumber, shortSha, criteriaMarkdown, testPath, execResult, ghClient);

  } catch (error) {
    console.error('❌ Pipeline failed:', error);
  } finally {
    await ghClient.close();
  }
}

async function processGitHubIssue(owner: string, repo: string, issueNumber: number) {
  const ghClient = await createMCPClient();
  const { tools } = await ghClient.listTools();
  const formattedTools = formatMCPToolsForClaude(tools);

  // Step 1: Analyze Issue Requirements
  const issueData = await runIssueAnalyzer(owner, repo, issueNumber, formattedTools, ghClient);
  console.log(`📌 Feature Identified: ${issueData.targetFeature}`);

  // Step 2: Fetch Related Code from Repo
  const featureCode = await runFeatureAnalyzer(owner, repo, issueData.targetFeature, formattedTools, ghClient);

  // Step 3: Generate Acceptance Criteria combining Issue Criteria + Source Code
  const mergedContext = `Issue Criteria:\n${issueData.acceptanceCriteria.join('\n')}\n\nCodebase Context:\n${featureCode}`;
  const criteriaMarkdown = await runCriteriaGenerator(mergedContext);

  // Step 4: Generate and Run Tests
  const fileSlug = `issue-${issueNumber}-${issueData.targetFeature.toLowerCase().replace(/\s+/g, '-')}`;
  const testPath = await runTestGenerator(criteriaMarkdown, featureCode, fileSlug,repo);
  const execResult = await runTestExecutor(testPath,repo);

  // Step 5: Post Execution Summary Report back to GitHub Issue
  await runReporter(owner, repo, issueNumber, fileSlug, criteriaMarkdown, testPath, execResult, ghClient);

  await ghClient.close();
}

// Execute pipeline
//main('mizanurdreamer', 'MCalendar', '1430c7a0de0a0e7b3ca64cfa8b06c7ce46a9f77c', 0);
//main('mizanurdreamer', 'MCalendar', 'Login only minimal test', 0);
processGitHubIssue('mizanurdreamer', 'MCalendar',  2);