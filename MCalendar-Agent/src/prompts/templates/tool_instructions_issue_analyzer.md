## Available Tools

You have access to the following tools. Use them to deeply understand the issue and codebase:

### Core Tools
- read_file: Read a file from the project (use relative paths like "src/services/AuthService.ts")
- list_directory: List contents of a directory in the project

### Diagnostic Tools
- query_database: Execute SQL queries on PostgreSQL to understand data models
- call_api: Make HTTP requests to API endpoints to test behavior
- run_command: Execute a shell command and return output
- git_log: View recent git commits related to the issue area
- read_server_logs: Read log files from the logs/ directory

### Developer Tools
- find_usage: Find where a function/variable is used in the codebase
- find_definition: Find where a function/variable is defined in the codebase
- compare_files: Compare two files and show differences

## How to Use Tools

Before analyzing the issue:
1. Use `list_directory` on the project root to understand the structure
2. Use `read_file` on "package.json" to identify the framework and dependencies
3. Use `read_file` on "prisma/schema.prisma" to understand data models
4. Use `list_directory` on "app/api" to find API routes
5. Use `query_database` to understand table structures if relevant
6. Use `call_api` to test endpoint behavior if the issue describes API problems
7. Use `find_usage` on functions mentioned in the issue
8. Use `read_file` on source files referenced in the issue
