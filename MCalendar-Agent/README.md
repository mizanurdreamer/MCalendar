# MCalendar Multi-AI Test Agent

An autonomous AI agent that reads GitHub issues and branch commits, analyzes the MCalendar codebase, generates Playwright E2E tests using configurable AI providers, executes them, and creates PRs with the results.

## Agent Overview

The agent is a pipeline of specialized AI sub-agents. Each sub-agent has a single responsibility and runs independently with its own system prompt. The **pipeline engine** (`engine/pipeline_engine.ts`) chains these sub-agents together, with each step returning a decision that controls what happens next (next, goto, retry, stop, done).

Provider and model are configured via `.env` — all tasks use the same provider/model automatically.

### Architecture

```
src/
├── engine/                         # Pipeline engine + core AI loop
│   ├── agent_runner_engine.ts      # ReAct loop (tool-use, conversation management)
│   ├── shared_context.ts           # Shared context object passed between steps
│   ├── pipeline_engine.ts          # Step runner with goto/retry/stop/done routing
│   ├── step_adapters.ts            # Wraps agent functions into pipeline steps
│   └── step_definitions.ts         # Defines issue/commit pipeline sequences
├── agent/                          # AI-powered sub-agents (single responsibility)
│   ├── agent_issue_analyzer.ts     # Analyze issue → determine test scenarios
│   ├── agent_tests_generator.ts    # Generate Playwright test code
│   ├── agent_tests_reviewer.ts     # Review + fix failing tests
│   ├── agent_tests_report_generator.ts  # Format test results
│   ├── agent_summarize.ts          # Format GitHub comment
│   └── agent_commit_analyzer.ts    # Decide if commit needs tests
├── orchestrator/                   # Thin setup shells (delegate to pipeline engine)
│   ├── issue_orchestrator.ts       # Setup context → run issue pipeline
│   └── commit_orchestrator.ts      # Setup context → run commit pipeline
├── github/                         # GitHub integration
│   ├── client.ts                   # REST API (Octokit)
│   ├── git_operations.ts           # Local git + commitAndPush + createPR
│   └── types.ts                    # Issue, PR, Commit types
├── test_runner/                    # Test execution
│   ├── playwright.ts               # Playwright runner
│   ├── tests_runner.ts             # Run tests wrapper
│   └── reporter.ts                 # Result formatting
├── watcher/                        # Auto-detection
│   ├── issue_orchestrator_watcher.ts  # Poll for new issues + commits
│   ├── commit_orchestrator_watcher.ts     # Detect new commits on branch
│   ├── issue_state_tracker.ts       # Processed issue tracking
│   └── commit_state_tracker.ts      # Last-seen SHA per branch
├── prompts/                        # System prompts (per AI task)
│   ├── index.ts                    # Barrel re-export
│   ├── issue_analyzer_prompt.ts
│   ├── commit_analyzer_prompt.ts
│   ├── tests_generator_prompt.ts
│   ├── tests_reviewer_prompt.ts
│   ├── tests_report_generator_prompt.ts
│   └── summarize_prompt.ts
├── providers/                      # AI provider abstraction
│   ├── types.ts                    # ProviderInterface, TaskConfig
│   ├── registry.ts                 # Provider factory
│   ├── anthropic.ts                # Claude (active)
│   ├── openai.ts                   # OpenAI (commented)
│   ├── google.ts                   # Gemini (commented)
│   └── ollama.ts                   # Local models (commented)
├── codebase/                       # Project analysis
│   ├── reader.ts                   # Read MCalendar files
│   └── structure.ts                # Build project map
├── config/                         # Configuration loading
│   ├── index.ts                    # Barrel re-export
│   └── config.ts                   # Env + agent.config.json loader
├── utils/                          # Shared utilities
│   ├── logger.ts                   # Winston logger (console + file)
│   ├── repo_resolver.ts            # URL detection, git clone, name extraction
│   ├── file.ts                     # File I/O
│   ├── tools.ts                    # Agent tool definitions
│   └── types.ts                    # TaskName, TaskResult
└── index.ts                        # CLI entry point
```

### Sub-Agents

| Agent | File | Purpose |
|-------|------|---------|
| `agent_runner_engine` | `src/engine/agent_runner_engine.ts` | Core ReAct loop — runs any sub-agent with tool calls (read files, write tests, run Playwright) and conversation management. |
| `pipeline_engine` | `src/engine/pipeline_engine.ts` | Executes step sequences with goto/retry/stop/done routing based on step decisions. |
| `issue_orchestrator` | `src/orchestrator/issue_orchestrator.ts` | Thin setup shell — creates context, runs issue pipeline, returns TaskResult. |
| `commit_orchestrator` | `src/orchestrator/commit_orchestrator.ts` | Thin setup shell — creates context, runs commit pipeline, returns TaskResult. |
| `agent_issue_analyzer` | `src/agent/agent_issue_analyzer.ts` | Reads a GitHub issue, explores the codebase, and determines what E2E test scenarios to write. |
| `agent_tests_generator` | `src/agent/agent_tests_generator.ts` | Generates Playwright test code based on analysis. Uses tools to write test files. |
| `agent_tests_reviewer` | `src/agent/agent_tests_reviewer.ts` | Reviews generated tests and fixes failures. Runs in a retry loop (up to 3x). |
| `agent_tests_report_generator` | `src/agent/agent_tests_report_generator.ts` | Formats test results into a structured report. |
| `agent_summarize` | `src/agent/agent_summarize.ts` | Formats test results into a GitHub comment. |
| `agent_commit_analyzer` | `src/agent/agent_commit_analyzer.ts` | Reads a commit diff and decides whether it needs new or updated E2E tests. |

### Non-AI Helpers

| Module | File | Purpose |
|--------|------|---------|
| `GitBranch` | `src/github/git_operations.ts` | Local git operations + commitAndPush + createPR. |
| `tests_runner` | `src/test_runner/tests_runner.ts` | Execute Playwright tests and return results. |
| `shared_context` | `src/engine/shared_context.ts` | Shared context object + decision types for pipeline steps. |
| `step_adapters` | `src/engine/step_adapters.ts` | Wraps agent functions into pipeline steps (adaptIssueAnalyzer, adaptTestGenerator, etc.). |
| `step_definitions` | `src/engine/step_definitions.ts` | Defines issue/commit pipeline step sequences. |

## How It Works

Both modes use the **pipeline engine** (`src/engine/pipeline_engine.ts`). Each step reads/writes a shared context and returns a decision that controls flow:

| Decision | Meaning |
|----------|---------|
| `next` | Proceed to the next step |
| `goto` | Jump to a named step |
| `retry` | Jump to a step + increment retry counter |
| `stop` | Halt pipeline (e.g., "no tests needed") |
| `done` | Successful completion |

### Issue Mode

```
GitHub Issue Created
        |
        v
orchestrator → create shared context
        |
        v
pipeline_engine → analyze_issue (agent_issue_analyzer)
        |        → understand what to test
        v
pipeline_engine → setup_branch (git)
        |
        v
pipeline_engine → generate_tests (agent_tests_generator)
        |        → write Playwright test code
        v
pipeline_engine → run_tests (tests_runner)
        |        → if failures, returns "retry" → jumps to review_and_fix
        v
pipeline_engine → generate_report (agent_tests_report_generator)
        |
        v
pipeline_engine → commit_push (git)
        |
        v
pipeline_engine → create_pr (git + GitHub)
        |
        v
pipeline_engine → summarize (agent_summarize)
        |        → post GitHub comment
        v
        done
```

### Commit Mode

```
Commit pushed to branch
        |
        v
orchestrator → create shared context
        |
        v
pipeline_engine → triage_commit (agent_commit_analyzer)
        |        → decide if tests needed
        |        → if not needed, returns "stop" → pipeline halts
        v
pipeline_engine → setup_branch (git)
        |
        v
pipeline_engine → generate_tests (agent_tests_generator)
        |        → write test code
        v
pipeline_engine → run_tests (tests_runner)
        |        → if failures, returns "retry" → jumps to review_and_fix
        v
pipeline_engine → generate_report (agent_tests_report_generator)
        |
        v
pipeline_engine → commit_push (git)
        |
        v
pipeline_engine → create_pr (git + GitHub)
        |
        v
pipeline_engine → summarize (agent_summarize)
        |        → post GitHub comment
        v
        done
```

## Features

- **Auto-detect new GitHub issues** via configurable polling
- **Auto-detect new commits** on a branch — triages diffs to decide if tests are needed
- **Generate Playwright E2E tests** using AI (Claude, OpenAI, Gemini, Ollama)
- **One-line provider switch** — change `PROVIDER` in `.env`, all tasks use it automatically
- **Model auto-selection** — set `MODEL=auto` to use the best model for your provider, or specify a custom model
- **Auto-create branches, commits, and PRs** for generated tests
- **Retry loop** for fixing failing tests (configurable max retries)
- **Auto-retry failed runs** — crashed pipelines or runs ending with failing tests are requeued and retried on the next poll (`RUN_MAX_RETRIES`, default 1); inspect via `npm start -- retry list`
- **Post results as GitHub comments** with test summaries
- **Three modes**: Issue (manual), Watch (auto-detect issues + commits), Watch-branch (commits only)

## Prerequisites

- Node.js >= 20.0.0
- npm
- GitHub Personal Access Token (with `repo` scope)
- AI provider API key (Anthropic, OpenAI, Google, or Ollama running locally)

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

## Configuration

### .env

| Variable | Required | Description |
|----------|----------|-------------|
| `PROVIDER` | Yes | AI provider: `anthropic`, `openai`, `google`, or `ollama` |
| `MODEL` | No | Model name or `auto` (default: `auto` — uses best model for provider) |
| `ANTHROPIC_API_KEY` | If using Anthropic | Anthropic API key |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI API key |
| `GOOGLE_API_KEY` | If using Google | Google Gemini API key |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `repo` scope |
| `REPO_OWNER` | If PROJECT_PATH is local | GitHub repo owner (auto-extracted if PROJECT_PATH is a URL) |
| `REPO_NAME` | If PROJECT_PATH is local | GitHub repo name (auto-extracted if PROJECT_PATH is a URL) |
| `PROJECT_PATH` | Yes | Local path or git URL to source project (name auto-extracted) |
| `TEST_PROJECT_PATH` | Yes | Local path or git URL to test project |
| `POLL_INTERVAL_MIN` | No | Polling interval in minutes (default: 1) |
| `AGENT_MAX_RETRIES` | No | Max test fix retries (default: 3) |
| `AGENT_MAX_ITERATIONS` | No | Max agent loop iterations per step (default: 20) |
| `MAX_PIPELINE_STEPS` | No | Max pipeline steps before abort (default: 50) |
| `RUN_MAX_RETRIES` | No | Auto-retries of failed runs (crash or failing tests) by the watcher (default: 1; `0` disables) |
| `AGENT_ENABLED` | No | Enable/disable agent (default: `true`). Set to `false` to stop all processing |
| `WATCH_BRANCH` | No | Branch to watch for commits (alternative to `--branch` flag) |

### Model Auto-Selection

| `MODEL` value | Behavior |
|---------------|----------|
| `auto` (default) | Uses the best default model for your provider |
| `claude-opus-4-6` | Overrides to specific model for all tasks |
| *(empty)* | Same as `auto` |

Default models per provider:

| Provider | Default Model |
|----------|---------------|
| `anthropic` | `claude-sonnet-4-20250514` |
| `openai` | `gpt-4.1` |
| `google` | `gemini-2.5-flash` |
| `ollama` | `llama3.2` |

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

## Agent Tools (29 tools)

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

### Tool Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | If using database tools | PostgreSQL connection string |
| `API_BASE_URL` | If using API tools | Base URL for HTTP requests |

## CLI Commands

| Command | Description |
|---------|-------------|
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
```

To enable OpenAI, Google, or Ollama providers:

1. Uncomment the provider file in `src/providers/` (e.g., `openai.ts`)
2. Uncomment the matching `case` block in `src/providers/registry.ts`
3. Set `PROVIDER` and API key in `.env`

## Supported Providers

| Provider | Package | Default Model | Status |
|----------|---------|---------------|--------|
| **Anthropic** | `@anthropic-ai/sdk` | `claude-sonnet-4-20250514` | Active |
| **OpenAI** | `openai` | `gpt-4.1` | Uncomment to enable |
| **Google Gemini** | `@google/genai` | `gemini-2.5-flash` | Uncomment to enable |
| **Ollama** | `openai` (compat) | `llama3.2` | Uncomment to enable |

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

Logs are written to both console and files using Winston:

| Log File | Content |
|----------|---------|
| `logs/agent.log` | All log levels (info, warn, error, debug) |
| `logs/error.log` | Errors only |

Log files rotate at 5MB with up to 5 files kept. Console output uses colored formatting.

## Troubleshooting

### "Missing required env var: PROVIDER"
Ensure `.env` has `PROVIDER=anthropic` (or openai/google/ollama).

### "Missing env var: ANTHROPIC_API_KEY"
Ensure `.env` has the API key for your chosen provider.

### "Git not initialized"
The agent needs git to create branches and commits. Ensure MCalendar is a git repo.

### "Playwright tests fail"
Tests mock API responses, so no database is needed. If tests still fail, the agent will retry up to `AGENT_MAX_RETRIES` times.

### "Provider not found"
Ensure the provider is uncommented in `src/providers/registry.ts` and the npm package is installed.

## GitHub API

The agent uses GitHub's REST API, which is **completely free**:

| Auth Method | Rate Limit | Cost |
|-------------|-----------|------|
| Unauthenticated | 60 req/hr | Free |
| Personal Access Token | 5,000 req/hr | Free |
| GitHub App | 15,000 req/hr | Free |

With polling every 1 minute (~60 req/hr), you use only **1.2%** of the PAT limit.
