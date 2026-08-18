import type { GitHubIssue } from "../github/types.js";
import type { CodebaseReader } from "../codebase/reader.js";
import { buildProjectMap } from "../codebase/structure.js";

function extractAcceptanceCriteria(body: string): string | null {
  if (!body) return null;

  const acSectionMatch = body.match(
    /(?:##?\s*(?:acceptance\s*criteria|ac|definition\s*of\s*done|done\s*when|requirements))\s*\n([\s\S]*?)(?=\n##?\s|\n---|\n\d+\.\s|\z)/i
  );
  if (acSectionMatch) {
    return acSectionMatch[1].trim();
  }

  const checkboxMatches = body.match(/- \[[ x]\].+/gi);
  if (checkboxMatches && checkboxMatches.length >= 2) {
    return checkboxMatches.join("\n");
  }

  return null;
}

function extractTestHints(body: string): string | null {
  if (!body) return null;

  const hintsMatch = body.match(
    /(?:##?\s*(?:test\s*(?:notes?|hints?|suggestions?)|testing\s*(?:notes?|hints?|suggestions?)))\s*\n([\s\S]*?)(?=\n##?\s|\n---|\z)/i
  );
  return hintsMatch ? hintsMatch[1].trim() : null;
}

export function buildIssueContext(issue: GitHubIssue, reader: CodebaseReader): string {
  const projectMap = buildProjectMap(reader);

  const labels = issue.labels.map((l) => l.name).join(", ") || "none";
  const acceptanceCriteria = extractAcceptanceCriteria(issue.body ?? "");
  const testHints = extractTestHints(issue.body ?? "");

  let context = `## GITHUB ISSUE #${issue.number}

**Title:** ${issue.title}
**Labels:** ${labels}
**Created:** ${issue.created_at}

**Description:**
${issue.body || "(No description provided)"}`;

  if (acceptanceCriteria) {
    context += `

---

## ACCEPTANCE CRITERIA (extracted from description)
${acceptanceCriteria}

**IMPORTANT:** Your tests MUST cover every acceptance criterion listed above.
Each criterion should have at least one test case verifying it.`;
  }

  if (testHints) {
    context += `

---

## TEST HINTS
${testHints}`;
  }

  context += `

---

## PROJECT INFORMATION
${projectMap}`;

  return context;
}

export function determineBaseBranch(issue: GitHubIssue, defaultBranch: string): string {
  const branchLabel = issue.labels.find((l) => l.name.startsWith("branch:"));
  if (branchLabel) return branchLabel.name.replace("branch:", "").trim();

  const body = issue.body ?? "";
  const branchMatch = body.match(/(?:base|target)\s+branch:\s*(\S+)/i);
  if (branchMatch) return branchMatch[1];

  return defaultBranch;
}
