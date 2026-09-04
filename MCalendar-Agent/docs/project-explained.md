# MCalendar-Agent - Complete Project Guide

## What This Project Does

MCalendar-Agent is an AI-powered automated test generation system for the MCalendar Next.js application. It uses 7 specialized AI agents orchestrated by LangGraph to:

1. Analyze GitHub issues or commit diffs
2. Generate Playwright E2E tests
3. Run the tests
4. Fix failing tests (and sometimes the application source code)
5. Generate reports and post results to GitHub

Two interfaces: a CLI (`npm run start`) and a web UI (`npm run ui`).

---

## Entry Points

### Entry Point 1: CLI Agent

**File:** `src/index.ts`
**Run:** `npm run start`

Commands:
- `issue <number>` - Process a GitHub issue
- `commit <sha>` - Process a commit
- `watch` - Poll GitHub for new issues and commits
- `watch-branch [branch]` - Watch a specific branch
- `list` - List open GitHub issues
- `ui` - Start the web UI server
- `retry list/issue/commit/clear` - Manage retries
- `approve <thread-id> <resolution>` - Approve/reject

### Entry Point 2: Web UI Server

**File:** `ui_server/main.ts` -> `ui_server/http.ts`
**Run:** `npm run ui` or `npm run ui:server`

Express server on `127.0.0.1:3002` serving REST API, WebSocket at `/ws`, and React SPA.

---

## Run Sequence

### 1. CLI Startup (`src/index.ts`)

```
Commander parses command
  -> loadConfig() reads .env + agent.config.json
  -> creates GitHubClient, CodebaseReader, PlaywrightRunner, GitBranch
  -> calls processIssue() or processCommit()
```

### 2. Orchestrator (`src/orchestrator/issue_orchestrator.ts`)

```
processIssue(issue, config)
  -> creates readers, runner, git, tool registry
  -> starts AppServer + Playwright MCP (if enabled)
  -> creates AgenticGraph, registers 6 agents + 5 critics
  -> creates test branch (git checkout -b)
  -> graph.invoke(initialState) -- starts pipeline
  -> handles human approval interrupts
  -> commits, pushes, creates PR
  -> cleanup in finally block
```

### 3. Graph Execution (`src/core/graph.ts`)

```
START -> SUPERVISOR -> (routes to agent) -> agent runs -> back to SUPERVISOR
                     -> (routes to run_tests) -> runs tests -> back to SUPERVISOR
                     -> (routes to critic) -> evaluates -> back to SUPERVISOR
                     -> (routes to humanApproval) -> interrupt -> back to SUPERVISOR
                     -> COMPLETE or FAIL -> END
```

### 4. Supervisor Decision (`src/core/supervisor.ts`)

1. Follows master plan from `AdvancedPlanner` if available
2. Falls back to hardcoded routing rules
3. Checks replan triggers (low scores, repeated errors, stuck pipeline)
4. Returns `RoutingDecision`: route, parallel, wait, complete, fail, replan, request_approval

### 5. Agent Execution (`src/core/base_agent.ts`)

Each agent's `run()` method:
1. Recalls past lessons from memory
2. Calls `runToolLoop()` -- the core agentic loop:
   - Sends messages + tools to LLM
   - LLM returns tool calls
   - Executes tools via ToolRegistry
   - Loops until LLM stops calling tools
3. Self-reflects via `reflect()` (LLM critic scores output)
4. Records reflection to memory
5. Returns updated AgentState

### 6. Test Execution (`src/test_runner/playwright.ts`)

```
PlaywrightRunner.run(filename, signal)
  -> executes: npx playwright test tests/filename --reporter=json,html
  -> parses JSON output for pass/fail counts
  -> discovers HTML report
  -> returns TestResult
```

---

## File-by-File Reference

### src/agents/ - AI Agent Implementations

| File | Class | Purpose |
|------|-------|---------|
| agent_issue_analyzer.ts | AgentIssueAnalyzer | Analyzes GitHub issues, determines test requirements |
| agent_commit_analyzer.ts | AgentCommitAnalyzer | Analyzes commit diffs, decides if tests needed |
| agent_tests_generator.ts | AgentTestsGenerator | Generates Playwright test files |
| agent_tests_reviewer.ts | AgentTestsReviewer | Fixes failing tests, routes target bugs to code fixer |
| agent_tests_report_generator.ts | AgentTestsReportGenerator | Generates markdown test reports |
| agent_code_fixer.ts | AgentCodeFixer | Fixes bugs in application source code |
| agent_summarize.ts | AgentSummarize | Creates summaries, posts GitHub comments |
| index.ts | - | Re-exports all agents |

### src/core/ - Framework Layer

| File | Purpose |
|------|---------|
| graph.ts | Builds and runs the LangGraph StateGraph. Entry point for pipeline. |
| supervisor.ts | Routing engine. Decides which agent runs next. |
| base_agent.ts | Base class for all agents. Provides tool loop, reflection, memory, messaging. |
| state.ts | Defines AgentState and all shared types. |
| planner.ts | LLM-powered execution plan generator. |
| agent_critic.ts | Evaluates agent output quality, produces revisions. |
| memory.ts | In-memory + PostgreSQL memory store for cross-run learning. |
| postgres_memory.ts | PostgreSQL memory implementation with full-text search. |
| message_bus.ts | In-process pub/sub for inter-agent communication. |
| metrics.ts | Tracks tokens, iterations, timing, retries per pipeline. |
| agent_events.ts | EventEmitter for real-time agent lifecycle events. |
| tool_registry.ts | Central registry for all tools agents can use. |
| register_tools.ts | Registers 30+ tools into the ToolRegistry. |
| adapters.ts | Legacy adapter for extracting SharedContext from state. |
| approval_store.ts | File-based persistent store for approval requests. |

### src/providers/ - LLM Provider Adapters

| File | Class | Provider |
|------|-------|----------|
| anthropic.ts | AnthropicProvider | Anthropic Claude (supports prompt caching) |
| openai.ts | OpenAIProvider | OpenAI GPT models |
| google.ts | GoogleProvider | Google Gemini |
| ollama.ts | OllamaProvider | Local Ollama LLMs |
| openrouter.ts | OpenRouterProvider | OpenRouter multi-model gateway |
| registry.ts | - | Factory/cache for provider instances by name |
| types.ts | - | ProviderInterface, ChatParams, ChatResponse types |

### src/github/ - GitHub Integration

| File | Purpose |
|------|---------|
| client.ts | GitHubClient wraps Octokit REST + GraphQL with retry logic |
| git_operations.ts | GitBranch uses simple-git for local git operations |
| types.ts | TypeScript interfaces for GitHub data models |

### src/mcp/ - Browser Automation

| File | Purpose |
|------|---------|
| client.ts | Manages Playwright MCP server lifecycle (start, call, restart, shutdown) |
| explore.ts | High-level function to explore live app with browser tools |
| tools.ts | Filters MCP tools to expose only exploratory browser tools |

### src/test_runner/ - Test Execution

| File | Purpose |
|------|---------|
| playwright.ts | PlaywrightRunner wraps npx playwright test with JSON parsing |
| tests_runner.ts | Thin wrapper adding logging around PlaywrightRunner |
| reporter.ts | Formats TestResult into markdown report |

### src/orchestrator/ - Pipeline Orchestrators

| File | Purpose |
|------|---------|
| issue_orchestrator.ts | processIssue() - full pipeline for GitHub issues |
| commit_orchestrator.ts | processCommit() - full pipeline for commit diffs |

### src/watcher/ - Polling System

| File | Purpose |
|------|---------|
| issue_orchestrator_watcher.ts | startWatcher() - polls GitHub for new issues, auto-processes |
| commit_orchestrator_watcher.ts | checkForNewCommits() - detects new commits on a branch |
| issue_state_tracker.ts | StateManager - tracks processed issues, retry queue |
| commit_state_tracker.ts | CommitStateManager - tracks processed commits, retry queue |

### src/codebase/ - Code Analysis

| File | Purpose |
|------|---------|
| reader.ts | CodebaseReader - reads files, lists directories, discovers routes |

### src/utils/ - Utilities

| File | Purpose |
|------|---------|
| agent_names.ts | Canonical agent name constants |
| constants.ts | All system constants (statuses, actions, types) |
| logger.ts | Winston logger with colored console + file transports |
| tools.ts | Central tool registry and executor |
| diagnostic_tools.ts | 12 diagnostic tools (shell, git, npm, process, port, etc.) |
| database_tools.ts | 3 database tools (schema, insert, cleanup) |
| dev_tools.ts | 10 developer tools (lint, types, coverage, diff, grep) |
| file.ts | Simple file system utilities |
| errors.ts | Global error handlers |
| types.ts | TaskResult and task name types |
| repo_resolver.ts | Resolves project paths from URLs (clones repos) |
| app_server.ts | Manages Next.js dev server lifecycle |

### ui/src/ - React Frontend

| File | Purpose |
|------|---------|
| main.tsx | React entry point, renders App |
| App.tsx | Root component - chat, jobs, messages, logs, sidebar |
| api.ts | HTTP API client with typed endpoints |
| ws.ts | useAgentSocket() hook - WebSocket connection, event dispatch |
| styles.css | Dark theme CSS (warm dark: #262624, accent: #d97757) |

### ui/src/components/ - UI Components

| File | Purpose |
|------|---------|
| Sidebar.tsx | Left panel: issues, branch commits, retries, recent jobs |
| JobCard.tsx | Displays job status, agent steps, test results |
| LogDrawer.tsx | Collapsible bottom drawer for raw agent logs |
| LiveLogStream.tsx | Inline tool activity display during execution |
| HumanApprovalPanel.tsx | Pending approval requests with action buttons |
| BranchCommitPanel.tsx | Scan branch commits and start processing jobs |

### ui_server/ - Backend Server

| File | Purpose |
|------|---------|
| main.ts | Entry point, parses --port, calls startWebServer() |
| http.ts | Express routes (REST API) + static UI serving |
| ws_hub.ts | WebSocket hub for broadcasting events to all clients |
| run_manager.ts | Job lifecycle (runIssue, runCommit, stop, abort) |
| chat_agent.ts | AI chat assistant with tool calling |
| log_transport.ts | Bridges Winston logger + agent events to WebSocket |

---

## Configuration

### .env Key Variables

- `PROVIDER`: anthropic/openai/google/ollama/openrouter
- `MODEL`: Model name (e.g. claude-haiku-4-5)
- `GITHUB_TOKEN`, `REPO_OWNER`, `REPO_NAME`
- `PROJECT_PATH`, `TEST_PROJECT_PATH`
- `WEB_PORT` (default 3002)
- `DATABASE_URL` (PostgreSQL for persistent memory)
- `PLAYWRIGHT_MCP_ENABLED`, `PLAYWRIGHT_MCP_BROWSER`
- `COMMIT_AUTO_APPROVE`, `ENABLE_HUMAN_GATES`

### agent.config.json

Per-agent LLM settings with maxTokens, temperature, promptCaching:
- agent_issue_analyzer: 4096 tokens, temp 0.3
- agent_tests_generator: 16384 tokens, temp 0.2
- agent_tests_reviewer: 16384 tokens, temp 0.2
- agent_code_fixer: 16384 tokens, temp 0.2
- agent_summarize: 2048 tokens, temp 0.3

---

## Key Dependencies

- `@langchain/langgraph` - Graph-based agent orchestration
- `@anthropic-ai/sdk`, `openai`, `@google/genai` - LLM APIs
- `@octokit/rest` - GitHub API
- `@modelcontextprotocol/sdk` - MCP browser automation
- `playwright` - Test runner
- `express` + `ws` - Web server
- `react` + `vite` - Frontend
- `pg` - PostgreSQL client
- `winston` - Logging
- `simple-git` - Local git operations
