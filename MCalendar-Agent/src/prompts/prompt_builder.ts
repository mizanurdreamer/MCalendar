import fs from "node:fs";
import path from "node:path";
import type { SharedContext, ProjectContext } from "../engine/shared_context.js";

type AgentType =
  | "commit_analyzer"
  | "issue_analyzer"
  | "tests_generator"
  | "tests_reviewer"
  | "report_generator"
  | "summarize";

interface PromptBuilderInput {
  agentType: AgentType;
  projectName: string;
  context?: SharedContext;
  superAdminEmail?: string;
  superAdminPassword?: string;
}

const TEMPLATES_DIR = path.join(import.meta.dirname, "templates");

function loadTemplate(name: string): string {
  const filePath = path.join(TEMPLATES_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${name}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

function buildToolCatalog(): string {
  const lines: string[] = [];
  lines.push("## Available Tools\n");

  lines.push("### Core Tools");
  lines.push("- **read_file**: Read a file from the project (use relative paths like \"src/services/AuthService.ts\")");
  lines.push("- **list_directory**: List contents of a directory in the project (returns file and folder names)");
  lines.push("- **write_test_file**: Write a generated Playwright test file to the test project's tests/. The filename should end with .spec.ts");
  lines.push("- **run_playwright_test**: Execute Playwright tests in the test project and return results (pass/fail, errors)");
  lines.push("");

  lines.push("### Diagnostic Tools");
  lines.push("- **run_command**: Execute a shell command and return output");
  lines.push("- **query_database**: Execute a SQL query on PostgreSQL database. Returns query results as JSON");
  lines.push("- **call_api**: Make an HTTP request to an API endpoint. Returns response status and body");
  lines.push("- **read_server_logs**: Read log files from the logs/ directory");
  lines.push("- **docker_command**: Execute a docker command (check containers, logs, etc.)");
  lines.push("- **git_log**: View recent git commits. Returns commit history");
  lines.push("- **git_diff**: Show git diff between commits or branches");
  lines.push("- **npm_command**: Run npm scripts or commands (test, build, lint, etc.)");
  lines.push("- **check_process**: Check if a process is running");
  lines.push("- **check_port**: Check if a port is in use and what process is using it");
  lines.push("- **env_check**: Read environment variables");
  lines.push("- **run_migration**: Run database migrations (prisma migrate)");
  lines.push("");

  lines.push("### Database Tools");
  lines.push("- **database_schema**: List all tables and their columns in the database");
  lines.push("- **database_insert**: Insert a row into a database table");
  lines.push("- **database_cleanup**: Delete test data from database tables");
  lines.push("");

  lines.push("### Developer Tools");
  lines.push("- **lint_code**: Run linter on code and return errors/warnings");
  lines.push("- **check_types**: Run TypeScript type checking. Returns type errors");
  lines.push("- **test_coverage**: Run tests with coverage report");
  lines.push("- **screenshot**: Take a screenshot of a URL using Playwright");
  lines.push("- **check_deps**: Check package.json for outdated or missing dependencies");
  lines.push("- **install_deps**: Install npm dependencies");
  lines.push("- **stack_trace**: Parse and analyze a stack trace. Returns file locations and error summary");
  lines.push("- **compare_files**: Compare two files and show differences");
  lines.push("- **find_usage**: Find where a function/variable is used in the codebase");
  lines.push("- **find_definition**: Find where a function/variable is defined in the codebase");

  return lines.join("\n");
}

function buildTestCredentials(superAdminEmail?: string, superAdminPassword?: string): string {
  const email = superAdminEmail || process.env.SUPER_ADMIN_EMAIL || "admin@bookingcalendar.com";
  const password = superAdminPassword || process.env.SUPER_ADMIN_PASSWORD || "Password123!";

  const lines: string[] = [];
  lines.push("## Test Credentials");
  lines.push(`- Super Admin: ${email} / ${password}`);
  lines.push("");
  lines.push("Use these credentials when writing tests that require admin access.");
  lines.push("Always use the write_test_file tool to save your generated test.");

  return lines.join("\n");
}

function buildCommitContext(context: SharedContext): string {
  if (!context.commitDiff) return "";

  const diff = context.commitDiff;
  const shortSha = diff.sha.slice(0, 7);

  const lines: string[] = [];
  lines.push("## Commit Being Analyzed");
  lines.push(`- Commit: ${shortSha} — ${diff.message}`);
  lines.push(`- Author: ${diff.author}`);
  lines.push(`- Date: ${diff.date}`);
  lines.push(`- Changes: +${diff.totalAdditions}/-${diff.totalDeletions} lines across ${diff.files.length} file(s)`);
  lines.push("");

  lines.push("### Files Changed");
  for (const file of diff.files) {
    lines.push(`- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`);
  }
  lines.push("");

  lines.push("### Diff Details");
  for (const file of diff.files) {
    lines.push(`### ${file.filename}`);
    lines.push("```diff");
    lines.push(file.patch ?? "(no patch available)");
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

function buildIssueContext(context: SharedContext): string {
  if (!context.issue) return "";

  const issue = context.issue;

  const lines: string[] = [];
  lines.push("## Issue Being Analyzed");
  lines.push(`- Issue #${issue.number}: ${issue.title}`);
  lines.push(`- Labels: ${issue.labels.join(", ") || "none"}`);
  lines.push(`- Created: ${issue.created_at}`);
  lines.push("");

  lines.push("### Description");
  lines.push(issue.body ?? "(no description)");

  return lines.join("\n");
}

function buildAnalysisContext(context: SharedContext): string {
  const lines: string[] = [];

  if (context.issueAnalysis) {
    const a = context.issueAnalysis;
    lines.push("## Analysis Results");
    lines.push(`- Summary: ${a.summary}`);
    lines.push(`- Functionality to test: ${a.functionality_to_test.join(", ")}`);
    lines.push(`- Relevant files: ${a.relevant_files.join(", ")}`);
    lines.push(`- API endpoints: ${a.api_endpoints.join(", ")}`);
    lines.push(`- Role checks: ${a.role_checks.join(", ")}`);
    lines.push(`- Edge cases: ${a.edge_cases.join(", ")}`);
    lines.push("");

    if (a.test_scenarios.length > 0) {
      lines.push("### Test Scenarios");
      for (let i = 0; i < a.test_scenarios.length; i++) {
        const s = a.test_scenarios[i];
        lines.push(`${i + 1}. ${s.name} (${s.type}): ${s.description}`);
        if (s.acceptance_criterion) {
          lines.push(`   Acceptance criterion: ${s.acceptance_criterion}`);
        }
      }
      lines.push("");
    }
  }

  if (context.commitAnalysis) {
    lines.push("## Commit Analysis");
    lines.push(`- Needs tests: ${context.commitAnalysis.needsTests}`);
    lines.push(`- Reason: ${context.commitAnalysis.reason}`);
    lines.push(`- Scope: ${context.commitAnalysis.scope ?? "General E2E testing"}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildErrorContext(context: SharedContext): string {
  if (!context.testResult || context.testResult.success) return "";

  const lines: string[] = [];
  lines.push("## Current Test Failures");
  lines.push(`- Passed: ${context.testResult.passed}/${context.testResult.total}`);
  lines.push(`- Failed: ${context.testResult.failed}/${context.testResult.total}`);
  lines.push("");

  if (context.testResult.errors.length > 0) {
    lines.push("### Error Details");
    for (const error of context.testResult.errors) {
      lines.push(error);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function replaceProjectName(template: string, projectName: string): string {
  return template.replace(/\{PROJECT_NAME\}/g, projectName);
}

function injectProjectContext(template: string, projectContext?: ProjectContext): string {
  if (!projectContext) return template;

  const deps = Object.entries(projectContext.dependencies)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ") || "none";

  return template
    .replace(/\{FRAMEWORK\}/g, projectContext.framework)
    .replace(/\{TEST_RUNNER\}/g, projectContext.testRunner)
    .replace(/\{DEPENDENCIES\}/g, deps)
    .replace(/\{DATA_MODELS\}/g, projectContext.dataModels || "(not found)")
    .replace(/\{API_ROUTES\}/g, projectContext.apiRoutes.join(", ") || "(none found)")
    .replace(/\{PROJECT_STRUCTURE\}/g, projectContext.projectStructure || "(not found)")
    .replace(/\{EXISTING_TEST_PATTERNS\}/g, projectContext.existingTestPatterns || "(no existing tests found)")
    .replace(/\{TEST_UTILS\}/g, projectContext.testUtils || "(no test utils found)");
}

export function buildPrompt(input: PromptBuilderInput): string {
  const { agentType, projectName, context, superAdminEmail, superAdminPassword } = input;

  const sections: string[] = [];
  const projectContext = context?.projectContext;

  // 1. Role (with project context injected)
  const roleName = `role_${agentType}`;
  let roleTemplate = replaceProjectName(loadTemplate(roleName), projectName);
  if (["issue_analyzer", "tests_generator", "commit_analyzer"].includes(agentType)) {
    roleTemplate = injectProjectContext(roleTemplate, projectContext);
  }
  sections.push(roleTemplate);

  // 2. Tool catalog
  sections.push(buildToolCatalog());

  // 3. Agent-specific tool instructions
  const toolInstructionName = `tool_instructions_${agentType}`;
  if (fs.existsSync(path.join(TEMPLATES_DIR, `${toolInstructionName}.md`))) {
    sections.push(loadTemplate(toolInstructionName));
  }

  // 4. Project discovery (REMOVED — now injected into role template above)
  // if (["issue_analyzer", "tests_generator"].includes(agentType)) {
  //   sections.push(loadTemplate("project_discovery"));
  // }

  // 5. Test credentials (for agents that write tests)
  if (["tests_generator", "tests_reviewer"].includes(agentType)) {
    sections.push(buildTestCredentials(superAdminEmail, superAdminPassword));
  }

  // 6. Context-specific sections
  if (context) {
    if (agentType === "commit_analyzer") {
      sections.push(buildCommitContext(context));
    } else if (agentType === "issue_analyzer") {
      sections.push(buildIssueContext(context));
    } else if (agentType === "tests_generator") {
      sections.push(buildAnalysisContext(context));
    } else if (agentType === "tests_reviewer") {
      sections.push(buildErrorContext(context));
    }
  }

  // 7. Output format instructions (per agent type)
  sections.push(getOutputFormat(agentType));

  return sections.join("\n\n");
}

function getOutputFormat(agentType: AgentType): string {
  switch (agentType) {
    case "commit_analyzer":
      return `## Output Format
Respond with ONLY valid JSON (no markdown, no code fences):
{ "needsTests": true/false, "reason": "brief explanation", "scope": "optional test scope suggestion or null" }`;

    case "issue_analyzer":
      return `## Output Format
Respond with ONLY valid JSON (no markdown, no code fences):
{
  "summary": "Brief summary of what the issue describes",
  "functionality_to_test": ["Feature 1", "Feature 2"],
  "relevant_files": ["src/path/to/file.ts"],
  "test_scenarios": [
    {
      "name": "should do something specific",
      "type": "positive",
      "description": "What this test verifies",
      "acceptance_criterion": "Which acceptance criterion this covers (if any)"
    }
  ],
  "edge_cases": ["Edge case 1", "Edge case 2"],
  "api_endpoints": ["POST /api/resource"],
  "role_checks": ["Role can access route"],
  "needs_tests": true
}

If no tests are needed (e.g., documentation-only change), set needs_tests to false and explain why in the summary.`;

    case "tests_generator":
      return `## Output Format
Generate complete, working Playwright test files.
The test file MUST be a complete, runnable .spec.ts file.
Use the write_test_file tool to save your generated test.

The analysis provided includes test scenarios with names, types, and descriptions.
Each test scenario MUST have a corresponding test case.
Name the test using the scenario name (e.g., test('should allow login with valid credentials')).`;

    case "tests_reviewer":
      return `## Output Format
If the test passes after your review:
- Verify all acceptance criteria are covered
- Check code quality
- Respond with "REVIEW: PASSED" and brief summary

If issues exist:
- Respond with "REVIEW: FAILED" and fix them using the write_test_file tool`;

    case "report_generator":
      return `## Output Format
Format as concise markdown with:
1. Summary line (X passed, Y failed)
2. Individual test results (name + status)
3. Error details (if any failures)
4. Recommendations (if failures suggest specific fixes)`;

    case "summarize":
      return `## Output Format
Format as a clear, concise GitHub markdown comment with:
1. Issue title and number
2. Branch name and PR link
3. Test results table (test name + pass/fail)
4. Files changed
5. How to run the tests locally
6. Any notes about limitations`;

    default:
      return "";
  }
}
