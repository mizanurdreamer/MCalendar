# MCalendar Agent — Complete Agent Flow Documentation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Infrastructure](#core-infrastructure)
3. [Issue Mode Pipeline](#issue-mode-pipeline)
4. [Commit Mode Pipeline](#commit-mode-pipeline)
5. [Agent Details](#agent-details)
6. [Supervisor Routing](#supervisor-routing)
7. [Critic and Reflection System](#critic-and-reflection-system)
8. [Planner System](#planner-system)
9. [Memory System](#memory-system)
10. [Message Bus](#message-bus)
11. [Tool System](#tool-system)
12. [Human Approval Flow](#human-approval-flow)
13. [Retry and Error Handling](#retry-and-error-handling)
14. [State Management](#state-management)

---

## Architecture Overview

MCalendar Agent is a multi-agent system built on **LangGraph** that automatically generates Playwright E2E tests for GitHub issues or commits. The system follows a supervisor-worker pattern where a central `Supervisor` routes execution between specialized agents.

### High-Level Components

```
Orchestrator (Entry Point)
    |
    v
AgenticGraph (LangGraph Workflow)
    |
    +-- Supervisor (Routing Brain)
    +-- AdvancedPlanner (Master Plan Generator)
    +-- Memory Store (Cross-Run Learning)
    +-- Message Bus (Inter-Agent Communication)
    |
    v
Agent Nodes:
    +-- IssueAnalyzer / CommitAnalyzer
    +-- TestsGenerator
    +-- [run_tests] (Built-in Node)
    +-- TestsReviewer
    +-- CodeFixer
    +-- TestsReportGenerator
    +-- Summarize
    +-- Critic (Per-Agent)
    +-- HumanApproval (Built-in Node)
```

### Agent Names

```typescript
// From src/utils/agent_names.ts
AGENT_NAMES = {
  AGENT_ISSUE_ANALYZER:          "agent_issue_analyzer",
  AGENT_COMMIT_ANALYZER:         "agent_commit_analyzer",
  AGENT_TESTS_GENERATOR:         "agent_tests_generator",
  AGENT_TESTS_REVIEWER:          "agent_tests_reviewer",
  AGENT_CODE_FIXER:              "agent_code_fixer",
  AGENT_TESTS_REPORT_GENERATOR:  "agent_tests_report_generator",
  AGENT_SUMMARIZE:               "agent_summarize",
}

CORE_AGENT_NAMES = {
  SUPERVISOR: "supervisor",
  CRITIC:     "critic",
  PLANNER:    "planner",
}
```

### Pipeline Status Constants

```typescript
PIPELINE_STATUS = {
  RUNNING:        "running",
  COMPLETED:      "completed",
  FAILED:         "failed",
  SKIPPED:        "skipped",
  AWAITING_HUMAN: "awaiting_human",
}

AGENT_STATUS = {
  IDLE:               "idle",
  PLANNING:           "planning",
  EXECUTING:          "executing",
  REFLECTING:         "reflecting",
  AWAITING_APPROVAL:  "awaiting_approval",
  COMPLETED:          "completed",
  FAILED:             "failed",
}
```

---

## Core Infrastructure

### Entry Point: Orchestrators

Two orchestrator functions serve as entry points:

**`processIssue()` in `src/orchestrator/issue_orchestrator.ts`**
- Accepts a `GitHubIssue` and `OrchestratorConfig`
- Creates all infrastructure: `CodebaseReader`, `PlaywrightRunner`, `GitBranch`
- Initializes tools via `registerAllTools()`
- Optionally starts the app server and Playwright MCP browser
- Creates initial state via `createInitialAgentState()` with `mode: MODE.ISSUE`
- Builds the `AgenticGraph` with 5 registered agents + 5 critics
- Creates a git branch from `main-agentic-ai-v2`
- Invokes the graph with a pipeline-level timeout (default: 30 minutes)
- Handles human approval interrupts via a `while` loop
- On success: commits, pushes, creates PR, updates GitHub issue status

**`processCommit()` in `src/orchestrator/commit_orchestrator.ts`**
- Accepts a `CommitDiff` and `CommitOrchestratorConfig`
- Nearly identical infrastructure setup
- Creates initial state with `mode: MODE.COMMIT`
- Registers `AgentCommitAnalyzer` instead of `AgentIssueAnalyzer`
- Branch naming: `test/commit-{shortSha}`
- On success: commits, pushes, creates PR
- Has a `SKIPPED` status path for commits that don't need tests

### Graph Construction (`src/core/graph.ts`)

The `AgenticGraph` class wraps LangGraph's `StateGraph`:

```
START -> supervisor
supervisor -> (conditional) -> any agent node / critic / run_tests / human_approval / END
every agent node -> supervisor
run_tests -> supervisor
critic -> supervisor
human_approval -> supervisor
```

Key features:
- **Checkpointer**: Uses `MemorySaver` for LangGraph checkpointing with `thread_id`
- **Recursion limit**: 100
- **State diffing**: `extractStateChanges()` compares old/new state and only returns changed fields to prevent unnecessary serialization
- **Safe state copy**: `safeStateCopy()` creates deep copies to prevent cross-agent mutation
- **Circuit breakers**: `stepCounter` (max pipeline steps, default 50) and `replanCounter` (max replans, 3)

### State Definition (`src/core/state.ts`)

The `AgentState` interface carries all data through the pipeline:

```typescript
interface AgentState {
  // Core
  mode: "issue" | "commit"
  runId: string
  status: "running" | "completed" | "failed" | "skipped" | "awaiting_human"
  currentAgent: AgentName
  error?: string

  // Input
  issue?: GitHubIssue
  commitDiff?: CommitDiff

  // Infrastructure (not serialized)
  agentConfig: AgentConfig
  reader: CodebaseReader
  runner: PlaywrightRunner
  git: GitBranch
  githubClient?: GitHubClient
  provider?: ProviderInterface
  memoryStore?: MemoryStore
  messageBus?: MessageBus

  // Configuration
  testReviewMaxRetries: number
  maxIterations: number
  maxPipelineSteps: number
  commitAutoApprove: boolean
  enableHumanGates: boolean

  // Pipeline outputs
  projectContext?: { framework, testRunner, dependencies, ... }
  issueAnalysis?: { summary, test_scenarios, needs_tests, relevant_files, ... }
  commitAnalysis?: { needsTests, reason, scope }
  testFilename?: string
  testContent?: string
  testResult?: TestResult
  report?: string
  summary?: string
  prUrl?: string

  // Code fixer state
  targetCodeIssues?: Array<{ file: string; issue: string; fix: string }>
  codeFixRetries: number
  maxCodeFixRetries: number

  // Coordination
  retries: number
  retryHistory: Array<{ attempt, errors, analysis }>
  plans: Record<AgentName, AgentPlan>
  messages: AgentMessage[]
  memory: MemoryEntry[]
  reflectionHistory: Record<AgentName, ReflectionResult[]>
  humanApprovals: HumanApprovalRequest[]
  stepHistory: Array<{ name, timestamp, agent, output, decision }>
  planStepIndex: number
}
```

---

## Issue Mode Pipeline

### Complete Flow

```
START
  |
  v
[Supervisor] -- Initial routing
  |
  v
[AgentIssueAnalyzer] -- Analyze GitHub issue
  |  Input: issue #, title, body, labels
  |  Processing: Explore app via MCP, read codebase, LLM analysis
  |  Output: issueAnalysis { test_scenarios, needs_tests, relevant_files, ... }
  |  State changes: issueAnalysis, reflectionHistory, messages, memory
  |
  v
[Supervisor] -- Decision: needs_tests?
  |  YES -> route to TestsGenerator
  |  NO  -> route to Summarize
  |
  v (if needs_tests)
[AgentTestsGenerator] -- Generate Playwright tests
  |  Input: issueAnalysis, projectContext, test scenarios
  |  Processing: Explore app DOM, read source files, generate test code
  |  Output: testFilename, testContent (written to disk via write_test_file)
  |  State changes: testFilename, testContent, reflectionHistory, messages
  |
  v
[Supervisor] -- Route to run_tests
  |
  v
[run_tests] -- Execute Playwright tests
  |  Input: testFilename
  |  Processing: runner.run(testFilename)
  |  Output: testResult { passed, failed, success, errors, ... }
  |  State changes: testResult
  |
  v
[Supervisor] -- Route to TestsReviewer
  |
  v
[AgentTestsReviewer] -- Analyze failures, classify fixes by scope
  |  Input: testContent, testResult.errors, retryHistory
  |  Processing: Debug via MCP, read source, analyze errors, classify each fix by scope
  |  Output: submit_analysis with scope per fix ("test" or "target")
  |  State changes: targetCodeIssues (target-scope fixes), testContent (test-scope fixes),
  |                 testResult (re-run), retryHistory, reflectionHistory
  |
  v
[Supervisor] -- Decision after reviewer
  |  tests pass? -> TestsReportGenerator
  |  targetCodeIssues exist AND codeFixRetries < maxCodeFixRetries?
  |      YES -> CodeFixer (inner loop)
  |  retries < testReviewMaxRetries?
  |      YES -> TestsGenerator (outer loop, with reviewer feedback)
  |  NO -> FAIL
  |
  v (if tests pass)
[AgentTestsReportGenerator] -- Generate markdown report
  |  Input: testResult, testFilename
  |  Processing: LLM generates markdown report
  |  Output: report (saved to reports/ directory)
  |  State changes: report, reportPath
  |
  v
[Supervisor] -- Route to Summarize
  |
  v
[AgentSummarize] -- Create GitHub comment summary
  |  Input: testResult, report, issue info
  |  Processing: LLM generates summary, posts to GitHub
  |  Output: summary (posted as GitHub comment)
  |  State changes: summary
  |
  v
[Supervisor] -- COMPLETE
  |
  v
[Orchestrator] -- Commit, push, create PR, update issue status
```

### Retry Loops in Issue Mode

The system has **two nested retry loops**:

**Inner Loop — Code Fix Retries** (default: `CODE_FIX_MAX_RETRIES=2`):
```
TestsReviewer -> [targetCodeIssues exist?] -> CodeFixer -> run_tests -> TestsReviewer
                                                     ^                      |
                                                     |___ codeFixRetries __|
                                                          < max?
```
When the reviewer identifies test failures caused by application bugs (not test bugs), it classifies those fixes with `scope="target"` and populates `state.targetCodeIssues`. The supervisor routes to `CodeFixer`, which fixes source code and re-runs tests. This loop continues until tests pass or `codeFixRetries` is exhausted.

**Outer Loop — Test Review Retries** (default: `TEST_REVIEW_MAX_RETRIES=3`):
```
TestsGenerator -> run_tests -> TestsReviewer -> [tests fail?]
                                                       |
                                     retries < max? ---+--- retries >= max?
                                         |                    |
                                         v                    v
                                TestsGenerator           FAIL
                               (with retryHistory,
                                reviewer feedback)
```
When the code fixer budget is exhausted (or no target issues were found), the system falls back to the general retry path. The reviewer sends a `FEEDBACK` message to `TestsGenerator` with errors and analysis.

When retrying:
1. `TestsReviewer` sends a `FEEDBACK` message to `TestsGenerator` with errors and analysis
2. `TestsGenerator` checks `state.retries > 0` and `state.testContent` (which was fixed by reviewer)
3. If reviewer already fixed the content, `TestsGenerator` writes the fixed content directly (skipping re-generation)
4. If not, `TestsGenerator` re-generates with reviewer feedback context

---

## Commit Mode Pipeline

### Complete Flow

```
START
  |
  v
[Supervisor] -- Initial routing
  |
  v
[AgentCommitAnalyzer] -- Analyze commit diff
  |  Input: commitDiff { sha, message, files, additions, deletions }
  |  Processing: Read changed files, explore app via MCP, assess risk
  |  Output: commitAnalysis { needsTests, reason, scope }
  |  State changes: commitAnalysis, reflectionHistory, messages
  |
  v
[Supervisor] -- Decision: needsTests?
  |  YES -> route to TestsGenerator
  |  NO  -> SKIP pipeline (status: SKIPPED)
  |
  v (if needsTests)
[AgentTestsGenerator] -- Generate Playwright tests
  |  Input: commitDiff, commitAnalysis.scope, changed files
  |  Processing: Same as Issue mode but scoped to commit changes
  |  Output: testFilename, testContent
  |
  v
[run_tests] -- Execute Playwright tests
  |
  v
[AgentTestsReviewer] -- Fix failing tests (same two-level retry loop as Issue mode)
  |
  v
[AgentTestsReportGenerator] -- Generate report
  |
  v
[AgentSummarize] -- Create summary
  |
  v
[Supervisor] -- COMPLETE
  |
  v
[Orchestrator] -- Commit, push, create PR
```

The only difference from Issue mode:
- Uses `AgentCommitAnalyzer` instead of `AgentIssueAnalyzer`
- CommitAnalyzer outputs `needsTests` (boolean), `reason` (string), `scope` (string|null)
- Has an early-exit `SKIPPED` status when no tests are needed
- Test filename format: `commit-{shortSha}.spec.ts` vs `issue-{number}-{slug}.spec.ts`

---

## Agent Details

### AgentIssueAnalyzer (`src/agents/agent_issue_analyzer.ts`)

**Purpose**: Analyze a GitHub issue and determine what E2E tests are needed.

**Input**: `state.issue` (GitHubIssue with number, title, body, labels)

**Processing**:
1. Recall past lessons from memory store
2. Explore the live app via Playwright MCP (`exploreAppWithMcp()`)
3. Explore project structure (read `package.json`, `src/`, `app/`)
4. Build a comprehensive user message with issue details, project structure, MCP exploration, and lessons
5. Enter the `runToolLoop()` with all issue_analyzer tools + `submit_analysis` tool
6. The LLM can use tools (read_file, list_directory, browser_*, database_*, etc.) to investigate
7. When the LLM calls `submit_analysis`, the tool call is intercepted and the input becomes the analysis

**Output**: `state.issueAnalysis`:
```typescript
{
  summary: string
  functionality_to_test: string[]
  relevant_files: string[]
  test_scenarios: Array<{
    name: string
    type: "positive" | "negative"
    description: string
    acceptance_criterion?: string
  }>
  edge_cases: string[]
  api_endpoints: string[]
  role_checks: string[]
  needs_tests: boolean
}
```

**Safety Override**: If `needs_tests` is false but the summary contains test-related keywords (test, crud, form, page, api, etc.), the agent forces `needs_tests = true` and generates placeholder scenarios.

**Self-Reflection**: After analysis, calls `this.reflect()` to evaluate quality. Reflection result stored in `reflectionHistory`.

**Messages Sent**:
- `FEEDBACK` to `AGENT_TESTS_GENERATOR` with analysis results
- `NOTIFICATION` to `SUPERVISOR` with `ISSUE_ANALYZED` event

---

### AgentCommitAnalyzer (`src/agents/agent_commit_analyzer.ts`)

**Purpose**: Analyze a git commit diff and determine if E2E tests are needed.

**Input**: `state.commitDiff` (sha, message, author, files with additions/deletions)

**Processing**: Similar to IssueAnalyzer but:
1. Reads the changed files directly (up to 5 files, 1500 chars each)
2. Explores changed file context rather than full project structure
3. Uses `submit_commit_analysis` tool instead of `submit_analysis`

**Output**: `state.commitAnalysis`:
```typescript
{
  needsTests: boolean
  reason: string
  scope: string | null  // e.g., "authentication flow", "API validation"
}
```

**Default Fallback**: If analysis cannot be parsed, defaults to `needsTests: true` with a generic reason.

---

### AgentTestsGenerator (`src/agents/agent_tests_generator.ts`)

**Purpose**: Generate Playwright E2E test files based on analysis.

**Input**: `state.issueAnalysis` or `state.commitAnalysis`, `state.testFilename`

**Processing**:
1. Recall past lessons and test patterns from memory
2. Check for reviewer feedback messages (on retry)
3. **Retry shortcut**: If `retries > 0` and `testContent` exists (reviewer already fixed it), write the fixed content directly and return
4. Build user message with test scenarios, edge cases, role checks
5. Enter `runToolLoop()` with tests_generator tools
6. LLM explores source files, reads DOM via browser tools, generates test code
7. Calls `write_test_file` tool to save the test file to disk
8. If file not found after tool loop, attempts `fallbackExtractAndWrite()`:
   - Makes one more LLM call asking specifically for test content
   - Tries to extract from tool call or markdown fences in text response

**Output**: `state.testFilename`, `state.testContent` (read back from disk)

**Test File Naming**:
- Issue mode: `issue-{number}-{slug}.spec.ts`
- Commit mode: `commit-{shortSha}.spec.ts`

**Rules Enforced**:
- Must use `write_test_file` tool (not just return text)
- Every scenario gets its own `test()` block
- For 15+ scenarios, batch with `write_test_file` + `append_test_file`
- Use relative URLs with baseURL from Playwright config
- Use JWT cookie injection for auth (not UI login flows)

---

### run_tests Node (`src/core/graph.ts` — `runTestsNode()`)

**Purpose**: Execute the generated Playwright test file.

**Input**: `state.testFilename`

**Processing**:
1. Get `runner` (PlaywrightRunner) from state
2. Call `runner.run(testFilename)`
3. Log results (passed, failed, errors)

**Output**: `state.testResult`:
```typescript
{
  success: boolean
  passed: number
  failed: number
  total: number
  errors: string[]
  output: string
  htmlReportPath?: string
}
```

This is a built-in graph node, not an agent. It does not use the LLM.

---

### AgentTestsReviewer (`src/agents/agent_tests_reviewer.ts`)

**Purpose**: Analyze test failures and classify fixes by scope (test file vs application source code).

**Input**: `state.testFilename`, `state.testResult`, `state.testContent`, `state.retryHistory`

**Processing**:
1. If `testResult.success` is true, skip review (return immediately)
2. Recall past error fixes and lessons from memory
3. **Error Analysis Phase** (`runErrorAnalysis()`):
   - Debug the live app via Playwright MCP (`debugAppWithMcp()`):
     - Navigate to the page the test targets
     - Take screenshots, get console messages, network requests, DOM snapshot
   - Explore source files referenced in the test (`exploreSourceFiles()`):
     - Extract URLs from `page.goto()` calls
     - Map URLs to Next.js app directory structure
     - Read the corresponding source files
   - Build analysis prompt with test content, errors, retry history, MCP debug info, source files, past fixes, lessons
   - Use `submit_analysis` tool to get structured fix plan with **scope classification** per fix:
     ```json
     {
       "root_cause": "...",
       "fixes_needed": [
         {"file": "...", "issue": "...", "fix": "...", "scope": "test"},
         {"file": "...", "issue": "...", "fix": "...", "scope": "target"}
       ],
       "priority": "high|medium|low"
     }
     ```
   - **Scope classification**: Each fix entry must include `scope`:
     - `scope="test"` — the fix is to the test file itself (wrong selector, wrong assertion, missing setup)
     - `scope="target"` — the fix is to the application source code (the bug is in the app, not the test)
4. **Scope Separation**:
   - Test-scope fixes are applied directly via `write_test_file`
   - Target-scope fixes are stored in `state.targetCodeIssues` for the `CodeFixer` agent
5. **Re-run Phase**: Execute the test again after fixing (test-scope fixes only)
6. If tests now pass: store the fix pattern in memory for future recall
7. If tests still failing: send `FEEDBACK` message to `TestsGenerator`

**Output**: Updated `state.testContent`, `state.testResult` (re-run results), `state.retryHistory`, `state.targetCodeIssues` (target-scope fixes for CodeFixer)

---

### AgentCodeFixer (`src/agents/agent_code_fixer.ts`)

**Purpose**: Fix bugs in the target application's source code when test failures are caused by application bugs (not test bugs).

**Input**: `state.targetCodeIssues` (populated by TestsReviewer when `scope="target"`)

**Processing**:
1. Read target issues from state — each entry has `file`, `issue`, and `fix` descriptions
2. Format issues into a numbered list with test error context from `state.testResult`
3. Enter `runToolLoop()` with `code_fixer` role tools
4. LLM reads source files via `read_file`, investigates the bug, applies fixes via `write_source_file`
5. Clear `state.targetCodeIssues` to `[]` after fixing (prevents the supervisor from routing back)

**Output**: Updated source files on disk, cleared `state.targetCodeIssues`

**Tools**: Uses `getByRole("code_fixer")` — includes all core, diagnostic, database, and dev tools, PLUS `write_source_file` (exclusively scoped to this role).

**System Prompt**: "You are the Code Fixer agent. Your job is to fix bugs in the TARGET PROJECT's source code (the application under test), NOT the test files. Use all available tools to investigate and fix the source code. Return the fixed source via write_source_file tool."

**State Changes**:
| Field | Change |
|-------|--------|
| `state.targetCodeIssues` | Set to `[]` (cleared after fixing) |
| `state.agentStatus[code_fixer]` | `COMPLETED` or `FAILED` |
| `state.stepHistory` | New entry: `{ name: "fix_source", output: "Fixed N source file(s)" }` |
| `state.messages` | `NOTIFICATION` to Supervisor with `CODE_FIXED` event |

---

### AgentTestsReportGenerator (`src/agents/agent_tests_report_generator.ts`)

**Purpose**: Generate a comprehensive markdown test report.

**Input**: `state.testResult`, `state.testFilename`

**Processing**:
1. Build user message with test results, errors, output, HTML report path
2. Single LLM call (no tool loop) to generate markdown report
3. Save report to `reports/` directory with filename format:
   - Issue: `issue-{number}-{date}.md`
   - Commit: `commit-{shortSha}-{date}.md`

**Output**: `state.report`, `state.reportPath`

---

### AgentSummarize (`src/agents/agent_summarize.ts`)

**Purpose**: Create a concise summary for GitHub comments.

**Input**: `state.testResult`, `state.report`, `state.issue`/`state.commitDiff`, `state.branchName`, `state.prUrl`

**Processing**:
1. Build user message with all pipeline results
2. Single LLM call to generate summary
3. Post summary as GitHub comment (to issue or PR)
4. If LLM fails, generates a fallback summary locally

**Output**: `state.summary` (posted to GitHub as comment)

---

## Supervisor Routing (`src/core/supervisor.ts`)

### Routing Decision Types

```typescript
type RoutingDecision =
  | { action: "route",         nextAgent: AgentName, reason: string }
  | { action: "parallel",      agents: AgentName[], reason: string }
  | { action: "wait",          reason: string }
  | { action: "complete",      reason: string }
  | { action: "fail",          reason: string }
  | { action: "replan",        reason: string }
  | { action: "request_approval", request: HumanApprovalRequest }
```

### Routing Flow

```
route() called
  |
  +-- Check if status is AWAITING_HUMAN -> checkHumanApprovals()
  +-- Check if status is COMPLETE -> return COMPLETE
  +-- Check if status is FAILED -> return REPLAN (trigger replanning)
  +-- checkReplanTriggers() -> may return REPLAN
  +-- determineNextAgent()
       |
       +-- If master plan exists -> followMasterPlan()
       +-- Else -> routeIssueMode() or routeCommitMode() (hardcoded fallback)
```

### Master Plan Following

The `AdvancedPlanner` generates a master plan at graph initialization. The supervisor follows it step-by-step:

1. When `currentAgent` is `supervisor`, find the next incomplete step by `planStepIndex`
2. If the step has `canRunParallel` and other parallel steps are ready, return `PARALLEL` action
3. Otherwise return `ROUTE` to the step's assigned agent
4. After an agent completes, `planStepIndex` advances
5. When all steps are done, return `COMPLETE`

### Hardcoded Fallback Routing

If no master plan is available, the supervisor uses hardcoded routing:

**Issue Mode** (`routeIssueMode()`):
```
supervisor -> issue_analyzer -> [needs_tests?] -> tests_generator -> run_tests
    -> tests_reviewer -> [tests pass?] -> tests_report_generator -> summarize -> COMPLETE
                        [fail + targetCodeIssues + codeFixRetries < max] -> code_fixer -> run_tests (loop)
                        [fail + retries < testReviewMaxRetries] -> tests_generator (retry)
```

**Commit Mode** (`routeCommitMode()`):
```
supervisor -> commit_analyzer -> [needsTests?] -> tests_generator -> run_tests
    -> tests_reviewer -> [tests pass?] -> tests_report_generator -> summarize -> COMPLETE
                        [fail + targetCodeIssues + codeFixRetries < max] -> code_fixer -> run_tests (loop)
                        [fail + retries < testReviewMaxRetries] -> tests_generator (retry)
```

### executeDecision()

When the supervisor decides, it mutates the state in-place:
- `ROUTE`: Sets `currentAgent` to the next agent
- `PARALLEL`: Runs agents concurrently via `Promise.all()`, merges state changes
- `WAIT`: Returns state unchanged (awaiting human)
- `COMPLETE`: Sets `status: COMPLETED`, `currentAgent: supervisor`
- `FAIL`: Sets `status: FAILED`, `error` message
- `REPLAN`: Sets `status: RUNNING`, `currentAgent: supervisor` (triggers replan on next cycle)
- `REQUEST_APPROVAL`: Pushes to `humanApprovals`, sets `status: AWAITING_HUMAN`

---

## Critic and Reflection System

### Two-Level Critique

The system has two levels of quality evaluation:

#### 1. Self-Reflection (in BaseAgent)

Every agent calls `this.reflect()` after completing its work:

```typescript
protected async reflect(output: string): Promise<ReflectionResult> {
  // LLM evaluates: correctness, completeness, quality, alignment
  // Returns: { score, strengths, weaknesses, suggestions, shouldRevise, revisedOutput? }
}
```

- Score: 0-100
- If `shouldRevise` is true, the agent logs a warning
- Reflection result stored in `state.reflectionHistory[agentName]`
- Also stored in memory as a `lesson_learned` entry for cross-run learning

#### 2. External Critic (AgentCritic)

Each agent has a dedicated `AgentCritic` instance registered in the graph:

```typescript
graph.registerCritic(AGENT_NAMES.AGENT_TESTS_GENERATOR, 
  new AgentCritic(state, taskContext, AGENT_NAMES.AGENT_TESTS_GENERATOR));
```

**Critic Flow** (invoked in `agentNode()` after agent completes):
1. Get the agent's output (`testContent`, `report`, or `summary`)
2. Call `critic.critiqueWithRevision(output, { goal, agent })`
3. Critic evaluates using LLM with verification:
   - Reads the test file from disk to verify structure
   - Checks for imports, test() calls, expect() assertions, describe blocks
   - For test files: actually runs the test to verify it works
   - For reports: checks for sections
4. If score < 70 and `shouldRevise` is true:
   - Critic generates `revisedOutput`
   - Verification step runs the revised test
   - If verified, the revised output replaces the agent's output in state
5. Up to `maxRevisions` (2) iterations

**Verification Logic** (`verifyRevisedOutput()`):
- For test files: checks imports, test() calls, expect(), describe blocks, brace matching, then runs the test
- For reports: checks for minimum sections
- For summaries: checks minimum length (50 chars)
- Partial improvement accepted if >70% tests pass

### Replanning Triggers

The supervisor checks for replanning in `checkReplanTriggers()`:

1. **Low average reflection score**: If average across all reflections < 50/100
2. **Repeated error pattern**: Same error in last 3 retries
3. **Pipeline stuck**: Same decision pattern in last 5 steps (not "next")
4. **Declining reflection scores**: Score dropped by >15 points between consecutive reflections

When replanning is triggered:
1. Collect all critic feedback from `reflectionHistory`
2. Call `planner.generateRevisedPlan()` with feedback
3. Reset `planStepIndex` to 0
4. The supervisor follows the revised plan on the next cycle

---

## Planner System (`src/core/planner.ts`)

### Master Plan Generation

At graph initialization (`invoke()`), the `AdvancedPlanner` generates a master plan:

1. Recalls past decisions and project context from memory
2. Sends a planning prompt to the LLM with:
   - Goal description
   - Available agents and their descriptions
   - Current state (mode, issue/commit, retries)
3. LLM returns a JSON plan with steps, dependencies, and parallelization hints
4. Plan is validated and enhanced:
   - Filter out unavailable agents
   - Set default values for missing fields
   - Enforce dependency constraints (steps with dependsOn cannot run parallel)
   - Auto-detect parallel groups

### Plan Structure

```typescript
interface AgentPlan {
  agent: "planner"
  goal: string
  steps: PlanStep[]
  estimatedIterations: number
  riskLevel: "low" | "medium" | "high"
  createdAt: number
  approved?: boolean
  parallelGroups?: string[][]
}

interface PlanStep {
  id: string
  agent?: AgentName
  tool: string
  args: Record<string, unknown>
  expectedOutcome: string
  reasoning: string
  dependsOn?: string[]
  canRunParallel?: boolean
}
```

### Default Plan

If LLM planning fails, the default plan is:

```
analyze -> generate -> review -> report -> summarize
```

With `parallelGroups: [["report", "summarize"]]` (though in practice they are sequential due to dependencies).

---

## Memory System (`src/core/memory.ts`)

### MemoryStore Interface

```typescript
interface MemoryStore {
  initialize(): Promise<void>
  store(entry: MemoryEntry): Promise<void>
  retrieve(type, tags, limit): Promise<MemoryEntry[]>
  retrieveById(id): Promise<MemoryEntry | null>
  delete(id): Promise<void>
  clear(): Promise<void>
  getStats(): Promise<{ totalEntries, byType }>
}
```

### Implementations

- **InMemoryStore**: `Map<string, MemoryEntry>` — loses data between runs
- **PostgresMemoryStore**: PostgreSQL-backed — persists across runs (loaded dynamically)

### Memory Entry Types

```typescript
type MemoryEntry = {
  id: string
  type: "code_pattern" | "test_pattern" | "issue_solution" | "error_fix" 
      | "project_context" | "decision" | "lesson_learned"
  content: string
  metadata: {
    project: string
    agent: AgentName
    success: boolean
    tags: string[]
    timestamp: number
    source?: string
  }
}
```

### How Agents Use Memory

**Storing** (`remember()`):
- Every agent stores reflection results as `lesson_learned` entries
- `TestsReviewer` stores successful fix patterns as `error_fix` entries
- Tags include agent name, project, and success status

**Recalling** (`recall()`, `recallFromStore()`, `recallLessons()`, `recallErrorFixes()`, `recallTestPatterns()`):
- Each agent recalls relevant memories at the start of its run
- `recallLessons()`: Retrieves past reflections for this agent type (up to 5)
- `recallErrorFixes()`: Retrieves past fix patterns (up to 3)
- `recallTestPatterns()`: Retrieves successful test patterns tagged with "playwright" or "e2e"
- Recalled memories are injected into the agent's context as formatted strings

### In-State Memory Array

`state.memory` holds an in-memory copy of all `MemoryEntry` objects created during the current run. The `recall()` method (synchronous) filters this array, while `recallFromStore()` queries the persistent store.

---

## Message Bus (`src/core/message_bus.ts`)

### Architecture

```
Agent A --publish(message)--> MessageBus --deliver--> Agent B (subscribed)
                                                \--> Broadcast subscribers
```

### Message Types

```typescript
MESSAGE_TYPE = {
  BROADCAST:    "broadcast",     // Delivered to all broadcast subscribers
  REQUEST:      "request",       // Request from one agent to another
  RESPONSE:     "response",      // Response to a request
  NOTIFICATION: "notification",  // One-way notification
  DELEGATION:   "delegation",    // Task delegation
  FEEDBACK:     "feedback",      // Feedback (e.g., reviewer -> generator)
}
```

### Message Flow Between Agents

1. **IssueAnalyzer -> TestsGenerator**: `FEEDBACK` with analysis results (scenarios, summary)
2. **IssueAnalyzer -> Supervisor**: `NOTIFICATION` with `ISSUE_ANALYZED` event
3. **CommitAnalyzer -> Supervisor**: `NOTIFICATION` with `COMMIT_ANALYZED` event
4. **TestsGenerator -> Supervisor**: `NOTIFICATION` with `TESTS_GENERATED` event
5. **TestsReviewer -> TestsGenerator**: `FEEDBACK` with errors and analysis (on retry)
6. **TestsReviewer -> Supervisor**: `NOTIFICATION` with `TESTS_REVIEWED` event
7. **CodeFixer -> Supervisor**: `NOTIFICATION` with `CODE_FIXED` event
8. **TestsReportGenerator -> Supervisor**: `NOTIFICATION` with `REPORT_GENERATED` event
9. **Summarize -> Supervisor**: `NOTIFICATION` with `SUMMARY_CREATED` event

### Message History

- Messages are stored in `state.messages` (persisted through the graph)
- `getMessages(from?, type?)` filters messages for a specific agent
- `getLatestMessage(from?, type?)` gets the most recent message
- `MessageBus` also maintains its own `messageHistory` (max 1000 entries) for logging

### Subscription

Agents can subscribe to messages via `initCommunication()`:
```typescript
this.initCommunication([AGENT_NAMES.AGENT_ISSUE_ANALYZER, AGENT_NAMES.AGENT_TESTS_REVIEWER]);
```

The graph also subscribes a broadcast logger to log all messages.

---

## Tool System

### Tool Registry (`src/core/tool_registry.ts`)

A singleton `ToolRegistry` manages all tools:

```typescript
class ToolRegistry {
  register(definition, handler, metadata): void
  getByRole(role, extraTools?): ToolDefinition[]
  execute(name, input, context): Promise<string>
}
```

Each tool has:
- **Definition**: Name, description, JSON input schema
- **Handler**: Async function that executes the tool
- **Metadata**: Category and roles (which agents can use it)

### Tool Categories and Registration (`src/core/register_tools.ts`)

**Core Tools** (available to all roles):
- `read_file` — Read a file from the project
- `list_directory` — List directory contents
- `write_test_file` — Write a Playwright test file to `tests/`
- `append_test_file` — Append test cases to existing file
- `run_playwright_test` — Execute Playwright tests

**Code Fixer Tools** (scoped to `code_fixer` role only):
- `write_source_file` — Write/overwrite a file in the target project source code (uses relative paths from project root)

**Diagnostic Tools** (registered from `diagnostic_tools.ts`):
- `find_usage` — Find where a function/variable is used
- `find_definition` — Find where a function/variable is defined
- `run_command` — Execute shell commands
- `npm_command` — Run npm scripts
- `git_log` — View recent commits
- `git_diff` — View git diff
- `lint_code` — Run linter
- `check_types` — TypeScript type checking
- `check_process` — Check running processes
- `check_port` — Check what's on a port
- `env_check` — Check environment variables
- `read_server_logs` — Read application logs

**Database Tools** (registered from `database_tools.ts`):
- `database_schema` — Query database schema
- `query_database` — Run SQL queries

**Dev Tools** (registered from `dev_tools.ts`):
- Additional development utilities

**MCP Browser Tools** (registered from `mcp/tools.ts`):
- `browser_navigate` — Navigate to a URL
- `browser_screenshot` — Take a screenshot
- `browser_snapshot` — Get DOM structure
- `browser_click` — Click an element
- `browser_type` — Type text into input
- `browser_console_messages` — Get console output
- `browser_network_requests` — Get network requests

### Tool Usage by Agent Role

```typescript
AGENT_ROLES = {
  agent_issue_analyzer:          "issue_analyzer"
  agent_commit_analyzer:         "commit_analyzer"
  agent_tests_generator:         "tests_generator"
  agent_tests_reviewer:          "tests_reviewer"
  agent_code_fixer:              "code_fixer"
  agent_tests_report_generator:  "tests_report_generator"
  agent_summarize:               "summarize"
}
```

Each role gets a different subset of tools from the registry via `getByRole()`.

### The Tool Loop (`BaseAgent.runToolLoop()`)

All agents use the same shared agentic tool-use loop:

```
while (iteration < maxIterations):
    1. Send messages to LLM with system prompt + tools
    2. LLM responds with content blocks (text + tool_use)
    3. If no tool calls or stopReason != "tool_use" -> break
    4. If onToolCall interceptor matches -> return early (used for submit_analysis)
    5. Execute each tool via ToolRegistry.execute()
    6. Append tool results as tool_result content blocks
    7. Loop back to step 1
```

**Safety Features**:
- `consecutiveErrors` counter: After 5 consecutive tool errors, injects help guidance
- `maxIterations` limit (default 50)
- Proactive stuck detection

---

## Human Approval Flow

### When Approvals Are Required

- Only triggered when `enableHumanGates: true` AND `commitAutoApprove: false`
- Only for plans with `riskLevel: "high"`
- The `requestHumanApproval()` method in `BaseAgent` creates a `HumanApprovalRequest`

### Approval Request Structure

```typescript
interface HumanApprovalRequest {
  id: string
  agent: AgentName
  type: "plan" | "test_generation" | "commit_push" | "pr_creation" | "architecture_decision"
  title: string
  description: string
  data: unknown
  options: [{ label: "Approve", value: "approve" }, { label: "Reject", value: "reject" }]
  createdAt: number
  resolved?: boolean
  resolution?: string
}
```

### Flow

```
Agent calls requestHumanApproval()
  |
  v
Pipeline status -> AWAITING_HUMAN
  |
  v
Supervisor detects AWAITING_HUMAN -> checkHumanApprovals() -> WAIT
  |
  v
Graph hits humanApprovalNode -> LangGraph interrupt()
  |
  v
Orchestrator detects status == AWAITING_HUMAN in result
  |
  v
Auto-approve (if commitAutoApprove) or reject
  |
  v
graph.resumeAfterApproval(threadId, "approve"|"reject")
  |
  v
Approval resolved -> pipeline continues or fails
```

### Resume Mechanism

Uses LangGraph's native `interrupt()` and `Command({ resume })`:
- `humanApprovalNode()` calls `interrupt()` with approval details
- Orchestrator detects the interrupt and calls `graph.resumeAfterApproval()`
- The graph resumes from the `humanApprovalNode` with the resolution

---

## Retry and Error Handling

### Two-Level Retry System

The system has **two nested retry loops** with independent budgets:

**Inner Loop — Code Fix Retries** (`CODE_FIX_MAX_RETRIES`, default 2):

When the reviewer identifies test failures caused by app bugs, it classifies fixes with `scope="target"` and populates `state.targetCodeIssues`. The supervisor routes to `CodeFixer`, which fixes source code via `write_source_file` and re-runs tests. This loop continues until tests pass or `codeFixRetries` is exhausted. After the code fixer completes, tests are always re-run via the `run_tests` node.

**Outer Loop — Test Review Retries** (`TEST_REVIEW_MAX_RETRIES`, default 3):

When the code fixer budget is exhausted (or no target issues were found), the system falls back to the general retry path. The reviewer sends a `FEEDBACK` message to `TestsGenerator` with errors and analysis. The generator re-generates tests with the reviewer's feedback context.

**Both exhausted**: The supervisor returns `FAIL` with message "Tests failed after N retries".

### Error Handling at Each Level

**Graph Level**:
- Each agent node wraps execution in try/catch
- On agent failure: `{ status: FAILED, error: "Agent {name} failed: {err}" }`
- Supervisor node failure: same pattern
- Pipeline timeout: 30-minute default, caught by `Promise.race()`

**Supervisor Level**:
- `executeAgent()` catches agent.run() failures
- `executeParallel()` catches Promise.all() failures
- Unknown agent in routing: returns FAIL

**Agent Level**:
- Tool execution errors: returned as "Error: ..." strings (not thrown)
- LLM call failures: caught and logged, fallback behavior
- File system errors: caught with graceful degradation
- MCP failures: caught and skipped (non-fatal)

**Orchestrator Level**:
- Branch creation failure: warns and continues on current branch
- Commit/push/PR failure: logged as error
- GitHub comment failure: warned as non-fatal
- MCP initialization failure: warned and continues
- Pipeline timeout: sets FAILED status with timeout error

### Circuit Breakers

1. **Step Counter**: `stepCounter` in `AgenticGraph` counts all node executions. If >= `maxPipelineSteps` (default 50), pipeline fails immediately.

2. **Replan Counter**: `replanCounter` tracks replanning attempts. If >= 3, pipeline fails.

3. **Tool Loop Iteration Limit**: Each agent's `runToolLoop()` caps at `maxIterations` (default 50).

4. **Consecutive Error Detection**: After 5 consecutive tool errors in the tool loop, injects help guidance and resets counter.

---

## State Management

### State Flow Through the Graph

```
createInitialAgentState()
  |
  v
graph.invoke(initialState)
  |
  v
[Node 1] receives state, returns Partial<AgentState>
  |
  v
LangGraph merges partial state with existing state
  |
  v
[Node 2] receives updated state, returns Partial<AgentState>
  |
  v
... (repeat until END)
```

### State Diffing

The `extractStateChanges()` method in `AgenticGraph` compares old and new state:

```typescript
private extractStateChanges(oldState, newState): Partial<AgentState> {
  const changes = {}
  for (const key of trackedKeys) {
    if (!deepEqual(oldState[key], newState[key])) {
      changes[key] = newState[key]
    }
  }
  return changes
}
```

Tracked keys: `issueAnalysis`, `commitAnalysis`, `testFilename`, `testContent`, `testResult`, `report`, `reportPath`, `summary`, `prUrl`, `branchName`, `retries`, `retryHistory`, `currentAgent`, `agentStatus`, `plans`, `messages`, `memory`, `reflectionHistory`, `humanApprovals`, `stepHistory`, `status`, `error`, `projectContext`.

### Checkpointing

- LangGraph's `MemorySaver` persists state at each node transition
- `thread_id` is the `runId` (e.g., `issue-123-1700000000000`)
- Enables resume-after-interrupt for human approval flows

### Heavy Object Handling

The `AgentStateAnnotation` in the graph excludes heavy objects (reader, runner, git, etc.) from annotation to prevent V8 crashes during checkpointing. These are passed via state but not serialized by LangGraph.

---

## Summary of Complete Pipelines

### Issue Mode (Happy Path)

```
Orchestrator: processIssue(issue, config)
  |
  1. Infrastructure setup (reader, runner, git, tools, MCP)
  2. createInitialAgentState(mode=ISSUE)
  3. createAgenticGraph()
  4. Register 6 agents + 6 critics
  5. Generate master plan (AdvancedPlanner)
  6. Create git branch
  7. graph.invoke(initialState)
     |
     +-> Supervisor routes to IssueAnalyzer
     +-> IssueAnalyzer explores app, reads code, analyzes issue
     +-> IssueAnalyzer reflects, sends messages, returns
     +-> [Critic evaluates IssueAnalyzer output]
     +-> Supervisor routes to TestsGenerator
     +-> TestsGenerator explores DOM, reads source, generates tests
     +-> TestsGenerator writes test file to disk
     +-> TestsGenerator reflects, returns
     +-> [Critic evaluates test content]
     +-> Supervisor routes to run_tests
     +-> run_tests executes Playwright, returns testResult
     +-> Supervisor routes to TestsReviewer
     +-> TestsReviewer analyzes errors, classifies fixes by scope
     +-> TestsReviewer applies test-scope fixes, populates targetCodeIssues
     +-> TestsReviewer reflects, returns
     +-> [Critic evaluates fix quality]
     +-> Supervisor routes to CodeFixer (if targetCodeIssues exist)
     +-> CodeFixer reads source, fixes app bugs via write_source_file
     +-> Supervisor routes to run_tests (re-verify after fix)
     +-> ... (code fix loop until pass or CODE_FIX_MAX_RETRIES exhausted)
     +-> Supervisor routes to TestsReportGenerator
     +-> TestsReportGenerator generates markdown report
     +-> [Critic evaluates report]
     +-> Supervisor routes to Summarize
     +-> Summarize creates GitHub comment
     +-> [Critic evaluates summary]
     +-> Supervisor returns COMPLETE
  8. Handle human approvals (if any)
  9. Commit, push, create PR
  10. Update GitHub issue status
  11. Shutdown MCP and app server
```

### Commit Mode (Happy Path)

```
Orchestrator: processCommit(diff, config)
  |
  1. Infrastructure setup
  2. createInitialAgentState(mode=COMMIT)
  3. createAgenticGraph()
  4. Register agents (CommitAnalyzer instead of IssueAnalyzer) + critics
  5. Generate master plan
  6. Create git branch (test/commit-{shortSha})
  7. graph.invoke(initialState)
     |
     +-> Supervisor routes to CommitAnalyzer
     +-> CommitAnalyzer reads changed files, explores app, assesses risk
     +-> CommitAnalyzer determines needsTests (may skip)
     +-> If needsTests: same pipeline as Issue mode (TestsGenerator -> run_tests -> TestsReviewer -> CodeFixer -> ...)
     +-> If !needsTests: SKIP status, early return
  8. Commit, push, create PR (if tests passed)
```

---

*Document generated from source files in `D:\Projects\MCalendar\MCalendar-Agent\src\`*
