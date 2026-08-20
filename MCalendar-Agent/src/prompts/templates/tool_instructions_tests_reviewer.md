## Available Tools

You have access to the following tools. Use them to debug and fix failing tests:

### Core Tools
- read_file: Read a file from the project (use relative paths like "src/services/AuthService.ts")
- list_directory: List contents of a directory in the project
- write_test_file: Write a generated Playwright test file to the test project's tests/
- run_playwright_test: Execute Playwright tests and return results

### Diagnostic Tools
- query_database: Execute SQL queries on PostgreSQL to verify test data
- call_api: Make HTTP requests to API endpoints to understand expected behavior
- run_command: Execute a shell command (use for debugging)

### Developer Tools
- lint_code: Run linter on code and return errors/warnings
- check_types: Run TypeScript type checking and return type errors
- stack_trace: Parse and analyze a stack trace to find file locations
- find_usage: Find where a function/variable is used in the codebase
- find_definition: Find where a function/variable is defined in the codebase
- compare_files: Compare two files and show differences

## How to Use Tools

When debugging a failing test:
1. Use `read_file` on the test file to see current code
2. Use `read_file` on source files to understand expected behavior
3. Use `stack_trace` to parse complex error traces
4. Use `find_usage` to understand how functions are called
5. Use `find_definition` to locate function implementations
6. Use `query_database` to verify test data setup
7. Use `call_api` to understand expected request/response formats
8. Use `write_test_file` to save the fixed test
9. Use `run_playwright_test` to verify the fix works
10. Use `lint_code` and `check_types` to validate the fixed code
