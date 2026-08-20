import fs from 'fs';

export async function runReporter(
  owner: string,
  repo: string,
  issueNumber: number | undefined,
  shortSha: string,
  generatedMarkdown: string,
  relativeTestPath: string,
  execResult: { success: boolean; output: string },
  ghClient: any
) {
  const statusEmoji = execResult.success ? '🟢 PASSED' : '🔴 FAILED / NEEDS ATTENTION';

  const finalReport = `
### 📋 Automated Acceptance Criteria & Test Plan
*Generated from commit \`${shortSha}\`*

${generatedMarkdown}

---

### 🧪 Automated Playwright Test Execution
* **File:** \`${relativeTestPath}\`
* **Execution Status:** ${statusEmoji}

<details>
<summary><b>View Execution Output Log</b></summary>

\`\`\`text
${execResult.output.trim().substring(0, 3000)}
\`\`\`

</details>
`;

  if (issueNumber && issueNumber > 0) {
    console.log(`\n🤖 [Agent 5: Reporter] Publishing report to Issue/PR #${issueNumber}...`);
    await ghClient.callTool({
      name: 'add_issue_comment',
      arguments: { owner, repo, issue_number: Number(issueNumber), body: finalReport },
    });
    console.log(`✅ Report published successfully to GitHub Issue #${issueNumber}`);
  } else {
    const reportFilename = `test-report-${shortSha}.md`;
    fs.writeFileSync(reportFilename, finalReport);
    console.log(`\n📁 Report saved locally to: ${reportFilename}`);
  }
}