## Available Tools

You have access to the following tools. Use them to generate high-quality tests:

### Core Tools
- read_file: Read a file from the project (use relative paths like "src/services/AuthService.ts")
- list_directory: List contents of a directory in the project
- write_test_file: Write a generated Playwright test file to the test project's tests/
- run_playwright_test: Execute Playwright tests and return results

### Diagnostic Tools
- query_database: Execute SQL queries on PostgreSQL to understand data models
- call_api: Make HTTP requests to API endpoints to understand behavior
- run_command: Execute a shell command (use for build checks, etc.)

### Developer Tools
- lint_code: Run linter on code and return errors/warnings
- check_types: Run TypeScript type checking and return type errors
- find_usage: Find where a function/variable is used in the codebase
- find_definition: Find where a function/variable is defined in the codebase

## How to Use Tools

Before writing tests:
1. Use `list_directory` and `read_file` to discover the project structure
2. Use `read_file` on existing test files to match patterns
3. Use `read_file` on source files you're testing to understand the code
4. Use `query_database` to understand data models and relationships
5. Use `call_api` to understand endpoint request/response formats

After writing tests:
1. Use `lint_code` on the generated test file
2. Use `check_types` to verify TypeScript correctness
3. Fix any issues before saving
