import type { CommitDiff } from "../github/types.js";
import type { TaskContext } from "../tasks/agent-runner.js";
import { runAgentLoop } from "../tasks/agent-runner.js";
import { SYSTEM_PROMPTS } from "../tasks/prompts.js";
import { logger } from "../utils/logger.js";

export interface CommitAnalysis {
  needsTests: boolean;
  reason: string;
  scope: string | null;
}

export async function analyzeCommit(
  diff: CommitDiff,
  ctx: TaskContext
): Promise<CommitAnalysis> {
  const fileList = diff.files
    .map((f) => `  ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
    .join("\n");

  const diffContent = diff.files
    .map((f) => `--- ${f.filename}\n${f.patch ?? "(binary or no patch)"}`)
    .join("\n\n");

  const prompt = `Analyze this commit to determine if it needs new or updated E2E tests.

COMMIT: ${diff.sha.slice(0, 7)} — ${diff.message}
AUTHOR: ${diff.author}
DATE: ${diff.date}
TOTAL: +${diff.totalAdditions}/-${diff.totalDeletions} lines across ${diff.files.length} file(s)

FILES CHANGED:
${fileList}

DIFF:
${diffContent}

Respond with ONLY valid JSON (no markdown, no code fences):
{ "needsTests": true/false, "reason": "brief explanation", "scope": "optional test scope or null" }`;

  const result = await runAgentLoop(
    ctx,
    SYSTEM_PROMPTS.analyze_commit,
    prompt,
    5
  );

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as CommitAnalysis;
      logger.info(`📋 Analysis: needsTests=${parsed.needsTests} — ${parsed.reason}`);
      return parsed;
    }
  } catch {
    logger.warn("Failed to parse commit analysis, defaulting to needsTests=true");
  }

  return { needsTests: true, reason: "Could not parse analysis, defaulting to generate tests", scope: null };
}
