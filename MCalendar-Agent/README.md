# MCalendar Multi-AI Test Agent

An autonomous AI agent that reads GitHub issues and branch commits, analyzes the MCalendar codebase, generates Playwright E2E tests using configurable AI providers, executes them, and creates PRs with the results.

## Agent Overview

The agent is a **LangGraph-based multi-agent system**. Each sub-agent has a single responsibility and runs independently with its own system prompt. The **Supervisor** routes between agents using a state graph, with decisions controlling flow (route, parallel, wait, complete, fail, request_approval).

Provider and model are configured via `.env` — all tasks use the same provider/model automatically. With `MODEL=auto` (default), the provider discovers its available models from its own API at runtime and uses the first one.

### Architecture

```
src/
├── core/                           # LangGraph agentic framework
│   ├── graph.ts                    # LangGraph StateGraph with checkpointing
│   ├── supervisor.ts               # Routes agents (route/parallel/wait/complete/fail/approval)
│   ├── state.ts                    # AgentState, AgentPlan, memory, messages, approvals
│   ├── planner.ts                  # AdvancedPlanner generates master plans with dependencies
│   ├── agent_critic.ts             # AgentCritic for self-revision (score-based)
│   ├── memory.ts                   # InMemoryStore for cross-run learning
│   ├── message_bus.ts              # Pub/sub for inter-agent communication
│   ├── approval_store.ts           # File-based approval persistence
│   └── base_agent.ts               # BaseAgent with planning, execution, reflection
├── agents/                         # AI-powered sub-agents (single responsibility)
│   ├── agent_issue_analyzer.ts     # Analyze issue → determine test scenarios
│   ├── agent_commit_analyzer.ts    # Decide if commit needs tests
│   ├── agent_tests_generator.ts    # Generate Playwright test code (agentic tool-use loop)
│   ├── agent_tests_reviewer.ts     # Review + fix failing tests (agentic tool-use loop + MCP debug)
│   ├── agent_tests_report_generator.ts  # Format test results
│   └── agent_summarize.ts          # Format GitHub comment
├── orchestrator/                   # Thin setup shells (delegate to agentic graph)
│   ├── issue_orchestrator.ts       # Setup context → run issue pipeline
│   └── commit_orchestrator.ts      # Setup context → run commit pipeline
├── github/                         # GitHub integration
│   ├── client.ts                   # REST API (Octokit)
│   ├── git_operations.ts           # Local git + commitAndPush + createPR
│   └── types.ts                    # Issue, PR, Commit types
├── test_runner/                    # Test execution
│   └── playwright.ts               # Playwright runner (synchronous, returns TestResult)
├── watcher/                        # Auto-detection
│   ├── issue_orchestrator_watcher.ts  # Poll for new issues + commits
│   ├── commit_orchestrator_watcher.ts # Detect new commits on branch
│   ├── issue_state_tracker.ts       # Processed issue tracking
│   └── commit_state_tracker.ts      # Last-seen SHA per branch
├── mcp/                            # Playwright MCP integration
│   ├── client.ts                   # MCP client lifecycle (init/shutdown)
│   └── tools.ts                    # MCP tool definitions
├── providers/                      # AI provider abstraction
│   ├── types.ts                    # ProviderInterface, TaskConfig
│   ├── registry.ts                 # Provider factory (all providers enabled)
│   ├── anthropic.ts                # Claude
│   ├── openai.ts                   # OpenAI
│   ├── google.ts                   # Gemini
│   ├── ollama.ts                   # Local models
│   └── openrouter.ts               # OpenRouter (100+ models, free-model auto-selection)
├── codebase/                       # Project analysis
│   └── reader.ts                   # Read source files
├── config/                         # Configuration loading
│   ├── index.ts                    # Barrel re-export
│   └── config.ts                   # Env + agent.config.json loader
├── utils/                          # Shared utilities
│   ├── logger.ts                   # Winston logger (console + file, broadcasts to UI)
│   ├── agent_names.ts              # Agent name constants
│   ├── repo_resolver.ts            # URL detection, git clone, name extraction
│   ├── tools.ts                    # Agent tool definitions
│   ├── diagnostic_tools.ts         # Diagnostic tool definitions
│   ├── dev_tools.ts                # Developer tool definitions
│   ├── database_tools.ts           # Database tool definitions
│   └── errors.ts                   # Global error handlers
├── ui_server/                     # Web UI backend
│   ├── http.ts                     # Express app (REST API + static UI serving)
│   ├── main.ts                     # Standalone server entry point
│   ├── ws_hub.ts                   # WebSocket hub (log/job/chat event broadcast)
│   ├── log_transport.ts            # Winston transport → WebSocket broadcast
│   ├── run_manager.ts              # Job manager (single-job lock + history)
│   └── chat_agent.ts               # Conversational agent with orchestrator tools
├── ui/                             # React chat frontend (built by Vite → ui/dist)
└── index.ts                        # CLI entry point
```

### Sub-Agents

| Agent | File | Purpose |
|-------|------|---------|
| `supervisor` | `src/core/supervisor.ts` | Routes agents through LangGraph state graph (route/parallel/wait/complete/fail/approval). |
| `planner` | `src/core/planner.ts` | AdvancedPlanner generates master plans with dependencies & parallel groups. |
| `critic` | `src/core/agent_critic.ts` | AgentCritic for self-revision with scoring (0-100) and automated fixes. |
| `agent_issue_analyzer` | `src/agents/agent_issue_analyzer.ts` | Reads a GitHub issue, explores the codebase, and determines what E2E test scenarios to write. |
| `agent_commit_analyzer` | `src/agents/agent_commit_analyzer.ts` | Reads a commit diff and decides whether it needs new or updated E2E tests. |
| `agent_tests_generator` | `src/agents/agent_tests_generator.ts` | Generates Playwright test code based on analysis. Uses agentic tool-use loop to write test files. On retry (after reviewer fixes), writes fixed content directly and re-runs tests. |
| `agent_tests_reviewer` | `src/agents/agent_tests_reviewer.ts` | Reviews generated tests and fixes failures. Runs in an agentic tool-use loop (up to 10 iterations). Can debug live apps via Playwright MCP to diagnose failures. |
| `agent_tests_report_generator` | `src/agents/agent_tests_report_generator.ts` | Formats test results into a structured report. |
| `agent_summarize` | `src/agents/agent_summarize.ts` | Formats test results into a GitHub comment and posts it. |

### Non-AI Helpers

| Module | File | Purpose |
|--------|------|---------|
| `GitBranch` | `src/github/git_operations.ts` | Local git operations + commitAndPush + createPR. |
| `PlaywrightRunner` | `src/test_runner/playwright.ts` | Execute Playwright tests synchronously, return TestResult. |
| `memory` | `src/core/memory.ts` | InMemoryStore for cross-run learning. |
| `message_bus` | `src/core/message_bus.ts` | Pub/sub for inter-agent communication. |
| `MCP Client` | `src/mcp/client.ts` | Playwright MCP browser automation for live app debugging. |

## How It Works

Both modes use the **LangGraph agentic framework** (`src/core/graph.ts`). The **Supervisor** (`src/core/supervisor.ts`) routes between agents using a state graph, where each agent returns a decision that controls flow:

| Decision | Meaning |
|----------|---------|
| `route` | Proceed to the next agent |
| `parallel` | Run multiple agents simultaneously |
| `wait` | Await human approval |
| `complete` | Successful completion |
| `fail` | Pipeline failed |
| `request_approval` | Request human approval |
| `replan` | Regenerate the master plan based on feedback |

### Issue Mode

```
GitHub Issue Created
        |
        v
orchestrator → create initial AgentState
        |
        v
Supervisor → agent_issue_analyzer (AgentIssueAnalyzer)
        |        → analyze issue, determine test scenarios
        v
Supervisor → agent_tests_generator (AgentTestsGenerator)
        |        → write Playwright test code (agentic tool-use loop)
        |        → run tests via PlaywrightRunner
        v
        |--- tests pass? --- yes ---> Supervisor → agent_tests_report_generator + agent_summarize (parallel)
        |                                     → generate report & GitHub comment
        |                                     → git commit + PR creation
        |                                     → completed
        |
        |--- tests fail? --- no ---> Supervisor → agent_tests_reviewer (AgentTestsReviewer)
                                        → analyze failures (optionally debug live app via MCP)
                                        → fix test content
                                        → retries++
                                        → route back to agent_tests_generator
                                        → (generator writes fixed content + re-runs tests)
                                        → loop until pass or max retries
```

### Commit Mode

```
Commit pushed to branch
        |
        v
orchestrator → create initial AgentState
        |
        v
Supervisor → agent_commit_analyzer (AgentCommitAnalyzer)
        |        → decide if tests needed
        |        → if not needed, Supervisor routes to agent_summarize → completed
        v
Supervisor → agent_tests_generator (AgentTestsGenerator)
        |        → write test code (agentic tool-use loop)
        |        → run tests via PlaywrightRunner
        v
        |--- tests pass? --- yes ---> Supervisor → agent_tests_report_generator + agent_summarize (parallel)
        |                                     → generate report & GitHub comment
        |                                     → git commit + PR creation
        |                                     → completed
        |
        |--- tests fail? --- no ---> Supervisor → agent_tests_reviewer (AgentTestsReviewer)
                                        → analyze failures (optionally debug live app via MCP)
                                        → fix test content
                                        → retries++
                                        → route back to agent_tests_generator
                                        → loop until pass or max retries
```

## Features

- **Auto-detect new GitHub issues** via configurable polling
- **Auto-detect new commits** on a branch — triages diffs to decide if tests are needed
- **Generate Playwright E2E tests** using AI (Claude, OpenAI, Gemini, Ollama, OpenRouter)
- **One-line provider switch** — change `PROVIDER` in `.env`, all tasks use it automatically
- **Model auto-selection** — set `MODEL=auto` and the provider discovers available models from its API (first one wins), or specify an exact model for all tasks; new model releases need no code changes
- **Auto-create branches, commits, and PRs** for generated tests
- **Retry loop** for fixing failing tests (configurable max retries)
- **Agentic tool-use loops** — Generator and Reviewer can iterate up to 10 times per step, calling tools and self-correcting
- **Playwright MCP browser automation** — agents can navigate to live apps, take screenshots, inspect console/network errors, and read DOM to diagnose test failures
- **Auto-retry failed runs** — crashed pipelines or runs ending with failing tests are requeued and retried on the next poll (`RUN_MAX_RETRIES`, default 1); inspect via `npm start -- retry list`
- **Post results as GitHub comments** with test summaries
- **Comprehensive logging** — every agent logs input analysis, decisions, tool calls, test results, and errors to both console/file and the Web UI via WebSocket
- **Three modes**: Issue (manual), Watch (auto-detect issues + commits), Watch-branch (commits only)
- **Web UI** — Claude-style chat console that can run any pipeline, answer questions about the project, and stream live agent logs (`npm run ui`)
- **Circuit breakers** — max pipeline steps, max replans, max retries prevent runaway loops
- **Parallel agent execution** — independent agents run simultaneously for faster pipelines

## Prerequisites

- Node.js >= 20.0.0
- npm
- PostgreSQL (running locally)
- GitHub Personal Access Token (with `repo` scope)
- AI provider API key (Anthropic, OpenAI, Google, Ollama, or OpenRouter)

## Quick Start

1. Navigate to the agent directory:
   ```bash
   cd D:\Projects\MCalendar\MCalendar-Agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your API key and provider
   ```

4. Run the agent:
   ```bash
   # Process a specific issue
   npm start -- issue 5

   # Watch for new issues
   npm start -- watch

   # Watch for issues + commits on a branch
   npm start -- watch --branch main

   # Watch commits only on a branch
   npm start -- watch-branch main

    # List open issues
    npm start -- list
    ```

## Database Setup

The agent uses PostgreSQL for two purposes:

| Database | Purpose | Created by |
|----------|---------|------------|
| `bookingcalendar` | MCalendar app data (diagnostic tools) | Docker Compose |
| `mcalendar_agent` | Agent persistent memory (lessons, patterns) | `npm run db:setup` |

### Start PostgreSQL

Ensure PostgreSQL is installed and running locally. Then create the required databases:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create the MCalendar app database
CREATE DATABASE bookingcalendar;

# Create the agent memory database
CREATE DATABASE mcalendar_agent;

# Exit
\q
```

Or run the agent's setup script to auto-create the `mcalendar_agent` database:

```bash
npm run db:setup
```

### Create Agent Memory Database

From the **MCalendar-Agent** directory:

```bash
cd D:\Projects\MCalendar\MCalendar-Agent
npm run db:setup
```

This creates the `mcalendar_agent` database and `agent_memories` table (idempotent — safe to run multiple times).

To reset the memory database:

```bash
npm run db:reset
```

### Verify .env Configuration

Ensure these are set in `MCalendar-Agent/.env`:

```bash
AGENT_MEMORY_DATABASE_URL=postgresql://user:pass@localhost:5432/mcalendar_agent
MEMORY_TYPE=persistent
```

> **Note:** Update the port, user, and password to match your local PostgreSQL setup.

## Web UI

A Claude-style chat console for operating the agent from the browser — no CLI needed. Start it with:

```bash
npm run ui        # builds the UI bundle, then serves it from the API server → http://localhost:3002

# Development (hot reload):
npm run dev:ui       # Vite dev server on port 3001 (proxies /api + /ws to the API)
npm run dev:server   # API server with tsx watch on port 3002
```

### What the chat can do

The chat agent uses your configured `PROVIDER`/`MODEL` and decides on its own which tools to call:

| You type | It does |
|----------|---------|
| *"process issue #3"* | Starts the full test-generation pipeline **in the background** — you can keep chatting; a result summary is posted automatically when it finishes |
| *"process commit abc1234"* | Starts commit triage + optional test generation in the background |
| *"what issues are open?"* / *"anything pending in retries?"* | Queries GitHub / retry queue |
| *"how is auth implemented?"* | Reads files from the target project via the codebase reader |
| *"is anything running?"* | Reports current job status |

While a pipeline job runs, winston agent logs stream live into the collapsible **Logs** drawer at the bottom, an inline **job card** shows progress, and the final summary (tests passed/failed, duration, files written) arrives as a chat message. You can continue asking questions while jobs run.

**Note:** only one pipeline job can run at a time (orchestrators share one git worktree). Starting a second job returns "already running".

### UI Features

| Area | Description |
|------|-------------|
| Chat pane | Markdown-rendered assistant replies, Enter to send, Shift+Enter for newline |
| Sidebar | Open issues (click to compose a processing prompt), retry queue (+ clear), current job, recent jobs history |
| Job cards | Live progress bar while running; pass/fail stats and error details when finished |
| Live logs | Collapsible bottom drawer streaming all agent activity via WebSocket |
| Suggested prompts | Quick-start chips in the sidebar footer |

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Repo, provider/model info (no secrets) |
| `/api/issues` | GET | List open GitHub issues |
| `/api/job` | GET | Current job status + recent history |
| `/api/jobs/issue` | POST | Start issue pipeline `{ number: int }` |
| `/api/jobs/commit` | POST | Start commit pipeline `{ sha: string, branch?: string }` |
| `/api/retries` | GET | Pending retry-queue entries |
| `/api/retries/clear` | POST | Clear all retries |
| `/api/chat` | POST | Send chat message `{ message: string, history?: [{ role, content }] }` |

WebSocket events are broadcast at `/ws`: `log`, `job:update`, `job:result`, `chat:activity`, `retries:update`.

The API server binds to `127.0.0.1` on port `3002` by default — change via `WEB_HOST`/`WEB_PORT` in `.env`. In dev mode, the Vite UI runs on port `3001` and proxies API/WebSocket calls to the server. (Port 3000 is left free for the MCalendar app under test.) No secrets are exposed through the API.

## Configuration

### .env

| Variable | Required | Description |
|----------|----------|-------------|
| `PROVIDER` | Yes | AI provider: `anthropic`, `openai`, `google`, `ollama`, or `openrouter` |
| `MODEL` | No | Model name or `auto` (default: `auto` — provider discovers available models from its API and uses the first one) |
| `ANTHROPIC_API_KEY` | If using Anthropic | Anthropic API key |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI API key |
| `GOOGLE_API_KEY` | If using Google | Google Gemini API key |
| `OPENROUTER_API_KEY` | If using OpenRouter | OpenRouter API key |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `repo` scope |
| `REPO_OWNER` | If PROJECT_PATH is local | GitHub repo owner (auto-extracted if PROJECT_PATH is a URL) |
| `REPO_NAME` | If PROJECT_PATH is local | GitHub repo name (auto-extracted if PROJECT_PATH is a URL) |
| `PROJECT_PATH` | Yes | Local path or git URL to source project (name auto-extracted) |
| `TEST_PROJECT_PATH` | Yes | Local path or git URL to test project |
| `POLL_INTERVAL_MIN` | No | Polling interval in minutes (default: 1) |
| `AGENT_MAX_RETRIES` | No | Max test fix retries (default: 3) |
| `AGENT_MAX_ITERATIONS` | No | Max agent loop iterations per step (default: 50) |
| `MAX_PIPELINE_STEPS` | No | Max pipeline steps before abort (default: 50) |
| `RUN_MAX_RETRIES` | No | Auto-retries of failed runs (crash or failing tests) by the watcher (default: 1; `0` disables) |
| `AGENT_ENABLED` | No | Enable/disable agent (default: `true`). Set to `false` to stop all processing |
| `COMMIT_AUTO_APPROVE` | No | Auto-approve human gates in pipeline (default: `true`). Set to `false` to require manual approval |
| `WATCH_BRANCH` | No | Branch to watch for commits (alternative to `--branch` flag) |
| `SUPER_ADMIN_EMAIL` | No | Super admin email for test credentials |
| `SUPER_ADMIN_PASSWORD` | No | Super admin password for test credentials |
| `PLAYWRIGHT_MCP_ENABLED` | No | Enable Playwright MCP browser automation (default: `false`). When enabled, agents can browse live apps to debug test failures |
| `PLAYWRIGHT_MCP_BROWSER` | No | Browser for Playwright MCP (default: `chromium`). Options: `chromium`, `firefox`, `webkit` |
| `PLAYWRIGHT_WORKERS` | No | Number of parallel workers for Playwright test runs (default: `6`) |
| `WEB_PORT` | No | Web UI API server port (default: `3002`) |
| `WEB_HOST` | No | Web UI bind address (default: `127.0.0.1`) |
| `DATABASE_URL` | For diagnostic tools | PostgreSQL connection string for MCalendar app DB |
| `AGENT_MEMORY_DATABASE_URL` | For persistent memory | PostgreSQL connection string for agent memory DB (falls back to `DATABASE_URL`) |
| `MEMORY_TYPE` | No | Memory store: `local` (in-memory, default) or `postgres` (persistent) |

### Model Auto-Selection

| `MODEL` value | Behavior |
|---------------|----------|
| `auto` (default) | Provider queries its API for available models and uses the **first one** returned |
| `claude-opus-4-6` | This exact model is used for ALL tasks |
| *(empty)* | Same as `auto` |

With `MODEL=auto`, the model is discovered dynamically from the provider's own API (`models.list()` / `/api/tags`) on first use and cached for the process — so newly released models are picked up automatically with zero code or config changes. The resolved model is logged at startup of the first task, e.g. `[anthropic] MODEL=auto → "claude-opus-4-6" (first model from API)`.

If discovery fails (bad key, network error), each provider falls back to a safe default:

| Provider | Fallback Model |
|----------|----------------|
| `anthropic` | `claude-sonnet-4-20250514` |
| `openai` | `gpt-5.4` |
| `google` | `gemini-2.5-flash` |
| `ollama` | `llama3.2` |
| `openrouter` | `meta-llama/llama-3.1-8b-instruct:free` |

See `.env.example` for a reference list of known model names per provider.

**OpenRouter note:** with `MODEL=auto`, OpenRouter prefers **free models** — it filters the API list to models with zero prompt/completion pricing and picks the first one. If no free models are available, it falls back to the first model in the list.

### agent.config.json

Per-task tuning for `maxTokens` and `temperature`. Provider and model come from `.env`.

```json
{
  "agent_issue_analyzer": {
    "maxTokens": 4096,
    "temperature": 0.3
  },
  "agent_commit_analyzer": {
    "maxTokens": 4096,
    "temperature": 0.3
  },
  "agent_tests_generator": {
    "maxTokens": 8192,
    "temperature": 0.2
  },
  "agent_tests_report_generator": {
    "maxTokens": 4096,
    "temperature": 0.1
  },
  "agent_tests_reviewer": {
    "maxTokens": 8192,
    "temperature": 0.2
  },
  "agent_summarize": {
    "maxTokens": 2048,
    "temperature": 0.3
  }
}
```

## Agent Tools (29+ tools)

All agents have access to these tools. The AI decides which tools to use based on context.

### Core Tools (4)

| Tool | Description |
|------|-------------|
| `read_file` | Read source code files |
| `list_directory` | List directory contents |
| `write_test_file` | Write Playwright test files |
| `run_playwright_test` | Run Playwright tests |

### Diagnostic Tools (12)

| Tool | Description |
|------|-------------|
| `run_command` | Execute shell commands |
| `query_database` | Execute SQL queries (PostgreSQL) |
| `call_api` | Make HTTP requests to APIs |
| `read_server_logs` | Read local log files from `logs/` |
| `docker_command` | Execute Docker commands |
| `git_log` | View recent git commits |
| `git_diff` | Show code changes between commits |
| `npm_command` | Run npm scripts (test, build, lint) |
| `check_process` | Check if a process is running |
| `check_port` | Check if a port is in use |
| `env_check` | Read environment variables |
| `run_migration` | Run database migrations |

### Database Tools (3)

| Tool | Description |
|------|-------------|
| `database_schema` | List tables and columns |
| `database_insert` | Insert test data |
| `database_cleanup` | Delete test data |

### Developer Tools (10)

| Tool | Description |
|------|-------------|
| `lint_code` | Run linter on code |
| `check_types` | Run TypeScript type checking |
| `test_coverage` | Run tests with coverage |
| `screenshot` | Take browser screenshot |
| `check_deps` | Check package.json dependencies |
| `install_deps` | Install npm packages |
| `stack_trace` | Parse and analyze stack traces |
| `compare_files` | Compare two files |
| `find_usage` | Find where code is used |
| `find_definition` | Find where code is defined |

### Playwright MCP Tools (when `PLAYWRIGHT_MCP_ENABLED=true`)

When enabled, the agent also has access to browser automation tools (navigating, clicking, screenshots, reading console errors, etc.) provided by the Playwright MCP server.

### Tool Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | If using database tools | PostgreSQL connection string |
| `API_BASE_URL` | If using API tools | Base URL for HTTP requests |

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run ui` | Build + start the Web UI (chat console) at http://localhost:3002 |
| `npm run dev:ui` / `npm run dev:server` | Hot-reload development mode for UI / API server |
| `npm start -- issue <number>` | Process a specific GitHub issue |
| `npm start -- watch` | Watch for new issues (auto-process) |
| `npm start -- watch --branch main` | Watch for issues + commits on `main` |
| `npm start -- watch-branch <branch>` | Watch only for commits on a branch |
| `npm start -- watch-branch <branch> --poll-interval 5` | Watch commits with 5 min interval |
| `npm start -- list` | List open GitHub issues |
| `npm start -- retry list` | List pending failed-run retries |
| `npm start -- retry issue <number>` | Reprocess a failed issue immediately |
| `npm start -- retry commit <sha>` | Reprocess a failed commit immediately |
| `npm start -- retry clear` | Clear all pending retries |

## Switching Providers

Change `PROVIDER` in `.env` and add the corresponding API key:

```bash
# Switch to OpenAI
PROVIDER=openai
MODEL=auto
OPENAI_API_KEY=sk-...

# Switch to Google
PROVIDER=google
MODEL=auto
GOOGLE_API_KEY=AIza...

# Switch to Anthropic
PROVIDER=anthropic
MODEL=auto
ANTHROPIC_API_KEY=sk-ant-...

# Switch to Ollama (local, no API key)
PROVIDER=ollama
MODEL=auto
# OLLAMA_BASE_URL=http://localhost:11434/v1

# Switch to OpenRouter (one key → 100+ models; auto prefers free models)
PROVIDER=openrouter
MODEL=auto
OPENROUTER_API_KEY=sk-or-...
```

All five providers are enabled by default — no code changes needed.

## Supported Providers

| Provider | Package | Fallback Model | Status |
|----------|---------|----------------|--------|
| **Anthropic** | `@anthropic-ai/sdk` | `claude-sonnet-4-20250514` | Active |
| **OpenAI** | `openai` | `gpt-5.4` | Active |
| **Google Gemini** | `@google/genai` | `gemini-2.5-flash` | Active |
| **Ollama** | `openai` (compat) | `llama3.2` | Active |
| **OpenRouter** | `openai` (compat) | `meta-llama/llama-3.1-8b-instruct:free` | Active |

## Acceptance Criteria

The agent parses GitHub issue descriptions for structured acceptance criteria. Supported formats:

- `## Acceptance Criteria` section with checkboxes
- `## AC` or `## Definition of Done` sections
- `- [ ]` checkbox lists (auto-detected as acceptance criteria)
- `## Test Hints` section for additional testing guidance

Each acceptance criterion is mapped to at least one test case during generation.

## Workspace Layout

```
D:\Projects\MCalendar\
  ├── .git/
  ├── MCalendar/              (source app — agent READS code here)
  ├── MCalendar-Agent/        (agent code — runs from here)
  └── MCalendar-Tests/        (test project — agent WRITES tests here)
                              ├── playwright.config.ts
                              ├── utils/token.ts
                              └── tests/
```

The agent **reads** source code from `MCalendar/` but **writes and runs** tests in `MCalendar-Tests/`. This keeps test generation isolated from the main app.

### URL Support

`PROJECT_PATH` and `TEST_PROJECT_PATH` support both local paths and git URLs:

| Input | Behavior |
|-------|----------|
| `D:\Projects\MCalendar\MCalendar` | Use local path directly |
| `https://github.com/owner/repo` | Shallow clone to `.cache/repos/repo` |
| `git@github.com:owner/repo.git` | Shallow clone to `.cache/repos/repo` |

Project name is auto-extracted from the path/URL for use in prompts and PR descriptions.

### Running Tests Manually

```bash
cd MCalendar-Tests
npx playwright test                          # run all tests
npx playwright test E2Etests/tests/issue-2-login-check.spec  # run specific test
npx playwright test --headed                 # run with browser visible
npx playwright test --debug                  # step through tests
```

## Logging

Logs are written to both console and files using Winston, and broadcast to the Web UI via WebSocket:

| Log File | Content |
|----------|---------|
| `logs/agent.log` | All log levels (info, warn, error, debug) |
| `logs/error.log` | Errors only |

Log files rotate at 5MB with up to 5 files kept. Console output uses colored formatting.

### What Gets Logged

Every agent logs comprehensive details:
- **Input analysis** — parsed issue/commit data, test scenarios, files to analyze
- **Decisions** — routing choices, tool calls, retry counts
- **Tool results** — file reads/writes, test execution output, git operations
- **Test results** — pass/fail counts, error details, HTML report paths
- **Errors** — stack traces, failed tool calls, MCP connection issues

## Troubleshooting

### "Missing required env var: PROVIDER"
Ensure `.env` has `PROVIDER=anthropic` (or openai/google/ollama/openrouter).

### "Missing env var: ANTHROPIC_API_KEY"
Ensure `.env` has the API key for your chosen provider.

### "Git not initialized"
The agent needs git to create branches and commits. Ensure MCalendar is a git repo.

### "Playwright tests fail"
Tests mock API responses, so no database is needed. If tests still fail, the agent will retry up to `AGENT_MAX_RETRIES` times. With `PLAYWRIGHT_MCP_ENABLED=true`, the reviewer agent can debug live apps to diagnose failures.

### "Provider not found"
Ensure the provider is uncommented in `src/providers/registry.ts` and the npm package is installed.

### "MCP transport error"
If using `PLAYWRIGHT_MCP_ENABLED=true`, ensure `npx` is available and the `@playwright/mcp` package can be downloaded. The first run may take longer as it downloads the MCP server.

### "PostgreSQL not creating automatically"
PostgreSQL is not bundled with the agent. You must start it separately:

```bash
# Connect to your local PostgreSQL
psql -U postgres

# Create the required databases
CREATE DATABASE bookingcalendar;
CREATE DATABASE mcalendar_agent;

# Exit
\q
```

Or run the agent's setup script to auto-create the `mcalendar_agent` database:

```bash
npm run db:setup
```

If you see connection errors, verify the port and credentials in your `.env` match your local PostgreSQL setup (default port: `5432`).

## GitHub API

The agent uses GitHub's REST API, which is **completely free**:

| Auth Method | Rate Limit | Cost |
|-------------|-----------|------|
| Unauthenticated | 60 req/hr | Free |
| Personal Access Token | 5,000 req/hr | Free |
| GitHub App | 15,000 req/hr | Free |

With polling every 1 minute (~60 req/hr), you use only **1.2%** of the PAT limit.
