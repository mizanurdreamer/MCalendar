# MCalendar Multi-AI Test Agent

An autonomous AI agent that reads GitHub issues and branch commits, analyzes the MCalendar codebase, generates Playwright E2E tests using configurable AI providers, executes them, and creates PRs with the results.

## Agent Overview

The agent is a pipeline of specialized AI sub-agents. Each sub-agent has a single responsibility and runs independently with its own AI provider, model, and prompt. The orchestrator agents (`Agent_Issue_Analyzer`, `Agent_Commit_Analyzer`) chain these sub-agents together into a full workflow.

### Sub-Agents

| Agent | File | Purpose |
|-------|------|---------|
| `Agent_Runner_Engine` | `src/agent/Agent_Runner_Engine.ts` | Core engine that runs any sub-agent in a loop. Handles tool calls (read files, write tests, run Playwright) and conversation management. Every sub-agent runs through this engine. |
| `Agent_Issue_Analyzer` | `src/agent/Agent_Issue_Analyzer.ts` | **Orchestrator** — takes a GitHub issue and runs the full pipeline: analyze issue → generate tests → run → fix → review → summarize → commit → PR → post comment. |
| `Agent_Commit_Analyzer` | `src/agent/Agent_Commit_Analyzer.ts` | **Orchestrator** — takes a branch commit, analyzes the diff, decides if tests are needed, and runs the pipeline: analyze commit → generate tests → run → fix → review → summarize → commit → PR. |
| `Agent_Commit_Triage` | `src/agent/Agent_Commit_Triage.ts` | **Triage** — reads a commit diff and decides whether it needs new or updated E2E tests. Returns a verdict: `needs_tests` or `skip`. Runs before the full pipeline to avoid unnecessary work. |
| `Agent_Summarize` | `src/agent/Agent_Summarize.ts` | **Formatter** — takes test results, review output, and PR info and produces a clean GitHub comment summarizing what was done. |
| `Agent_Issue_Context_Builder` | `src/agent/Agent_Issue_Context_Builder.ts` | **Context** — reads a GitHub issue and builds a context string for the AI: parses acceptance criteria, test hints, labels, and determines the correct base branch. |
| `Agent_Git_Operations` | `src/agent/Agent_Git_Operations.ts` | **Git** — handles branch creation, checkout, commit, and push operations for the agent. |

### AI Task Agents

These are the AI-powered tasks that run inside `Agent_Runner_Engine`. Each has its own system prompt and can use a different AI provider:

| Task | Prompt | Purpose |
|------|--------|---------|
| `Agent_Analyze_Issue` | `src/prompts/analyze_issue_prompt.ts` | Understands the issue and determines what E2E tests need to be written. |
| `Agent_Analyze_Commit` | `src/prompts/analyze_commit_prompt.ts` | Reviews a commit diff and decides if new or updated tests are needed. |
| `Agent_Generate_Tests` | `src/prompts/generate_tests_prompt.ts` | Generates Playwright test code based on analysis. Uses tools to write test files. |
| `Agent_Review_Tests` | `src/prompts/review_tests_prompt.ts` | Reviews generated tests for quality, coverage, and correctness. |
| `Agent_Fix_Tests` | `src/prompts/fix_tests_prompt.ts` | Takes failing test output and fixes the test code. Runs in a retry loop. |
| `Agent_Summarize` | `src/prompts/summarize_prompt.ts` | Formats test results into a GitHub comment. |

## How It Works

### Issue Mode

```
GitHub Issue Created
        |
        v
Agent_Issue_Context_Builder  -> parse issue, acceptance criteria
        |
        v
Agent_Runner_Engine + Agent_Analyze_Issue  -> understand what to test
        |
        v
Agent_Runner_Engine + Agent_Generate_Tests -> write Playwright test code
        |
        v
Playwright runs tests
        |
        v  (if failures)
Agent_Runner_Engine + Agent_Fix_Tests  -> fix failing tests (up to 3x)
        |
        v
Agent_Runner_Engine + Agent_Review_Tests  -> quality check
        |
        v
Git commit + push + create PR
        |
        v
Agent_Runner_Engine + Agent_Summarize  -> format GitHub comment
```

### Commit Mode

```
Commit pushed to branch
        |
        v
Agent_Commit_Triage  -> decide if tests needed
        |
        v  (if needed)
Agent_Runner_Engine + Agent_Analyze_Commit  -> review diff
        |
        v
Agent_Runner_Engine + Agent_Generate_Tests -> write test code
        |
        v
Playwright runs tests
        |
        v  (if failures)
Agent_Runner_Engine + Agent_Fix_Tests  -> fix failing tests (up to 3x)
        |
        v
Agent_Runner_Engine + Agent_Review_Tests  -> quality check
        |
        v
Git commit + push + create PR
        |
        v
Agent_Runner_Engine + Agent_Summarize  -> format GitHub comment
```

## Features

- **Auto-detect new GitHub issues** via configurable polling
- **Auto-detect new commits** on a branch — triages diffs to decide if tests are needed
- **Generate Playwright E2E tests** using AI (Claude, OpenAI, Gemini, Ollama)
- **User-configurable AI providers** — assign any AI provider to any task
- **Auto-create branches, commits, and PRs** for generated tests
- **Retry loop** for fixing failing tests (configurable max retries)
- **Post results as GitHub comments** with test summaries
- **Three modes**: Issue (manual), Watch (auto-detect issues + commits), Watch-branch (commits only)

## Prerequisites

- Node.js >= 20.0.0
- npm
- GitHub Personal Access Token (with `repo` scope)
- Anthropic API Key (or other provider keys)

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
   # Edit .env with your API keys
   ```

4. Configure AI providers (optional):
   Edit `agent.config.json` to assign different providers to different tasks.

5. Run the agent:
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
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `OPENAI_API_KEY` | No | OpenAI API key (for future use) |
| `GOOGLE_API_KEY` | No | Google Gemini API key (for future use) |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `repo` scope |
| `REPO_OWNER` | Yes | GitHub repo owner |
| `REPO_NAME` | Yes | GitHub repo name |
| `PROJECT_PATH` | Yes | Absolute path to MCalendar source project (for reading code) |
| `TEST_PROJECT_PATH` | Yes | Absolute path to MCalendar-Tests project (for writing/running tests) |
| `POLL_INTERVAL_MIN` | No | Polling interval in minutes (default: 1) |
| `MAX_RETRIES` | No | Max test fix retries (default: 3) |
| `AGENT_ENABLED` | No | Enable/disable agent (default: `true`). Set to `false` to stop all processing |
| `WATCH_BRANCH` | No | Branch to watch for commits (alternative to `--branch` flag) |

### agent.config.json

Each task can use a different AI provider and model:

```json
{
  "tasks": {
    "Agent_Analyze_Issue": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 4096,
      "temperature": 0.3
    },
    "Agent_Analyze_Commit": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 4096,
      "temperature": 0.3
    },
    "Agent_Generate_Tests": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 8192,
      "temperature": 0.2
    },
    "Agent_Review_Tests": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 4096,
      "temperature": 0.1
    },
    "Agent_Fix_Tests": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 8192,
      "temperature": 0.2
    },
    "Agent_Summarize": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 2048,
      "temperature": 0.3
    }
  },
  "providers": {
    "anthropic": { "apiKeyEnv": "ANTHROPIC_API_KEY" },
    "openai": { "apiKeyEnv": "OPENAI_API_KEY" },
    "google": { "apiKeyEnv": "GOOGLE_API_KEY" },
    "ollama": { "baseURL": "http://localhost:11434/v1", "model": "llama3.2" }
  }
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm start -- issue <number>` | Process a specific GitHub issue |
| `npm start -- watch` | Watch for new issues (auto-process) |
| `npm start -- watch --branch main` | Watch for issues + commits on `main` |
| `npm start -- watch-branch <branch>` | Watch only for commits on a branch |
| `npm start -- watch-branch <branch> --poll-interval 5` | Watch commits with 5 min interval |
| `npm start -- list` | List open GitHub issues |

## Project Structure

```
MCalendar-Agent/
  agent.config.json              # Task -> provider mapping
  src/
    index.ts                     # CLI entry point
    config/                      # Configuration loading
      index.ts                   # Barrel re-export
      config.ts                  # Env + agent.config.json loader
    agent/                       # All agent logic
      Agent_Runner_Engine.ts     # Core engine (tool-use loop)
      Agent_Issue_Analyzer.ts    # Issue pipeline orchestrator
      Agent_Commit_Analyzer.ts   # Commit pipeline orchestrator
      Agent_Commit_Triage.ts     # Decide if commit needs tests
      Agent_Summarize.ts         # Format results for GitHub comment
      Agent_Issue_Context_Builder.ts  # Parse issue + acceptance criteria
      Agent_Git_Operations.ts    # Git branch/commit/push
    prompts/                     # System prompts (per AI task)
      index.ts                   # Barrel re-export
      analyze_issue_prompt.ts
      analyze_commit_prompt.ts
      generate_tests_prompt.ts
      review_tests_prompt.ts
      fix_tests_prompt.ts
      summarize_prompt.ts
    providers/                   # AI provider abstraction
      types.ts                   # ProviderInterface, TaskConfig
      registry.ts                # Provider factory
      anthropic.ts               # Claude (active)
      openai.ts                  # OpenAI (commented)
      google.ts                  # Gemini (commented)
      ollama.ts                  # Local models (commented)
    github/                      # GitHub API integration
      client.ts                  # REST API + commit methods
      types.ts                   # Issue, PR, Commit types
    codebase/                    # Project analysis
      reader.ts                  # Read MCalendar files
      structure.ts               # Build project map
    watcher/                     # Auto-detection
      Agent_Issue_Analyzer_Watcher.ts  # Polling loop (issues + commits)
      Agent_Commit_Analyzer_Watcher.ts # Poll branch for new commits
      Issue_State_Tracker.ts     # Processed issue tracking
      Commit_State_Tracker.ts    # Last-seen commit SHA per branch
    test_runner/                 # Test execution
      playwright.ts              # Playwright runner
      reporter.ts                # Result formatting
    utils/                       # Shared utilities
      logger.ts                  # Colored output
      file.ts                    # File I/O
      tools.ts                   # Agent tool definitions
      types.ts                   # TaskName, TaskResult
```

## Acceptance Criteria

The agent parses GitHub issue descriptions for structured acceptance criteria. Supported formats:

- `## Acceptance Criteria` section with checkboxes
- `## AC` or `## Definition of Done` sections
- `- [ ]` checkbox lists (auto-detected as acceptance criteria)
- `## Test Hints` section for additional testing guidance

Each acceptance criterion is mapped to at least one test case during generation.

## Adding a New AI Provider

### Step 1: Uncomment the provider file

Edit the provider file in `src/providers/`:

- `openai.ts` — OpenAI GPT models
- `google.ts` — Google Gemini models
- `ollama.ts` — Local models via Ollama

### Step 2: Uncomment the registry case

Edit `src/providers/registry.ts` and uncomment the matching `case` block.

### Step 3: Add the API key to .env

```
OPENAI_API_KEY=sk-...
# or
GOOGLE_API_KEY=AIza...
```

### Step 4: Update agent.config.json

```json
{
  "tasks": {
    "Agent_Generate_Tests": {
      "provider": "openai",
      "model": "gpt-5.4"
    }
  }
}
```

## Supported Providers

| Provider | Package | Models | Status |
|----------|---------|--------|--------|
| **Anthropic** | `@anthropic-ai/sdk` | claude-sonnet-4-20250514, claude-opus-4-6 | Active |
| **OpenAI** | `openai` | gpt-5.4, gpt-4.1, o3 | Commented out |
| **Google Gemini** | `@google/genai` | gemini-2.5-flash, gemini-2.5-pro | Commented out |
| **Ollama** | `openai` (compat) | llama3.2, codellama, etc. | Commented out |

## Workspace Layout

```
D:\Projects\MCalendar\
  ├── .git/
  ├── MCalendar/              (source app — agent READS code here)
  ├── MCalendar-Agent/        (agent code — runs from here)
  └── MCalendar-Tests/        (test project — agent WRITES tests here)
                              ├── playwright.config.ts
                              ├── utils/token.ts
                              └── tests/e2e/
```

The agent **reads** source code from `MCalendar/` but **writes and runs** tests in `MCalendar-Tests/`. This keeps test generation isolated from the main app.

### Running Tests Manually

```bash
cd MCalendar-Tests
npx playwright test                          # run all tests
npx playwright test tests/e2e/issue-5-*.spec.ts  # run specific test
npx playwright test --headed                 # run with browser visible
npx playwright test --debug                  # step through tests
```

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
Ensure `.env` file exists and contains your API key.

### "Git not initialized"
The agent needs git to create branches and commits. Ensure MCalendar is a git repo.

### "Playwright tests fail"
Tests mock API responses, so no database is needed. If tests still fail, the agent will retry up to `MAX_RETRIES` times.

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

A GraphQL API alternative is included (commented out in `src/github/client.ts`) for more efficient fetching.
