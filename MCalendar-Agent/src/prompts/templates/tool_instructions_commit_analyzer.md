## Available Tools

You have access to the following tools. Use them to understand the project before making your decision:

### Core Tools
- read_file: Read a file from the project (use relative paths like "src/services/AuthService.ts")
- list_directory: List contents of a directory in the project

### Diagnostic Tools
- git_log: View recent git commits to understand project history
- git_diff: Show git diff between commits or branches
- run_command: Execute a shell command and return output

### Developer Tools
- find_usage: Find where a function/variable is used in the codebase
- find_definition: Find where a function/variable is defined in the codebase

## How to Use Tools

Before deciding if tests are needed:
1. Use `list_directory` on the changed file's parent directory to understand the module structure
2. Use `read_file` on the changed files to understand what was modified
3. Use `find_usage` on changed functions to see what depends on them
4. Use `git_log` to see recent changes to the area
