# MCalendar Multi-AI Test Agent

An autonomous agentic AI that reads GitHub issues, analyzes the MCalendar codebase, generates Playwright E2E tests using configurable AI providers, executes them, and creates PRs with the results. Also watches branch commits for testable changes.

## Features

- **Auto-detect new GitHub issues** via configurable polling
- **Auto-detect new commits** on a branch — analyzes diffs with AI to decide if tests are needed
- **Generate Playwright E2E tests** using AI (Claude, OpenAI, Gemini, Ollama)
- **User-configurable AI providers** — assign any AI to any task
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
    "analyze_issue": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 4096,
      "temperature": 0.3
    },
    "generate_tests": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 8192,
      "temperature": 0.2
    },
    "review_tests": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 4096,
      "temperature": 0.1
    },
    "fix_tests": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "maxTokens": 8192,
      "temperature": 0.2
    },
    "summarize": {
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

## How It Works

### Issue Mode

```
GitHub Issue Created
        |
        v
Agent detects via polling (every 1 min)
        |
        v
Fetches issue details from GitHub API
        |
        v
Creates branch: test/issue-{n}-{slug}
        |
        v
+------------------------------------------+
|  Task Pipeline (each uses AI):           |
|  1. analyze_issue  -> understand issue   |
|  2. generate_tests -> write test code    |
|  3. Run Playwright tests                 |
|  4. fix_tests (if failures, up to 3x)   |
|  5. review_tests   -> quality check      |
|  6. summarize      -> format comment     |
+------------------------------------------+
        |
        v
Git commit + push branch
        |
        v
Create Pull Request
        |
        v
Post GitHub comment with results
```

### Commit Mode

```
Commit pushed to branch
        |
        v
Agent detects via polling
        |
        v
Fetches commit diff from GitHub API
        |
        v
+------------------------------------------+
|  AI decides if tests needed:             |
|  - analyze_commit -> review diff         |
|  - If no tests needed -> skip            |
|  - If tests needed -> continue           |
+------------------------------------------+
        |
        v
Creates branch: test/commit-{sha}
        |
        v
+------------------------------------------+
|  Task Pipeline (each uses AI):           |
|  1. generate_tests -> write test code    |
|  2. Run Playwright tests                 |
|  3. fix_tests (if failures, up to 3x)   |
|  4. review_tests   -> quality check      |
|  5. summarize      -> format comment     |
+------------------------------------------+
        |
        v
Git commit + push branch
        |
        v
Create Pull Request
```

## Project Structure

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

## Acceptance Criteria

The agent parses GitHub issue descriptions for structured acceptance criteria. Supported formats:

- `## Acceptance Criteria` section with checkboxes
- `## AC` or `## Definition of Done` sections
- `- [ ]` checkbox lists (auto-detected as acceptance criteria)
- `## Test Hints` section for additional testing guidance

Each acceptance criterion is mapped to at least one test case during generation.

## Task Reference

| Task | Purpose | When It Runs |
|------|---------|-------------|
| `analyze_issue` | Understand what needs testing from the issue | Issue mode — always |
| `analyze_commit` | Decide if a commit needs tests (reviews diff) | Commit mode — always |
| `generate_tests` | Generate Playwright test code | After analysis (if tests needed) |
| `review_tests` | Review test quality and coverage | After generation |
| `fix_tests` | Fix failing tests from error output | If tests fail |
| `summarize` | Format results for GitHub comment | After PR creation |

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
    "generate_tests": {
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

## Architecture

```
MCalendar-Agent/
  agent.config.json          # Task -> provider mapping
  src/
    index.ts                 # CLI entry point
    config.ts                # Environment + config loading
    providers/               # AI provider abstraction layer
      types.ts               # ProviderInterface, TaskConfig
      registry.ts            # Provider factory
      anthropic.ts           # Claude (active)
      openai.ts              # OpenAI (commented)
      google.ts              # Gemini (commented)
      ollama.ts              # Local models (commented)
    tasks/                   # Individual task implementations
      types.ts               # TaskName, TaskResult
      tools.ts               # Agent tool definitions
      prompts.ts             # System prompts
      agent-runner.ts        # Agent loop (tool-use)
    github/                  # GitHub API integration
      client.ts              # REST API + commit methods
      types.ts               # Issue, PR, Commit types
    codebase/                # Project analysis
      reader.ts              # Read MCalendar files
      structure.ts           # Build project map
    agent/                   # Orchestration
      orchestrator.ts        # Issue pipeline
      commit-orchestrator.ts # Commit pipeline
      commit-analyzer.ts     # AI decides if commit needs tests
      context-builder.ts     # Issue context + acceptance criteria parsing
      branch.ts              # Git operations
      context-builder.ts     # Context assembly
    watcher/                 # Auto-detection
      polling.ts             # Polling loop (issues + commits)
      state.ts               # Processed issue tracking
      commit-state.ts        # Last-seen commit SHA per branch
      commit-watcher.ts      # Poll branch for new commits
    runner/                  # Test execution
      playwright.ts          # Playwright runner
      reporter.ts            # Result formatting
    utils/                   # Shared utilities
      logger.ts              # Colored output
      file.ts                # File I/O
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
