## Project Discovery

Before starting your task, you MUST understand the project structure:

1. Use `list_directory` on the project root to see the overall structure
2. Use `read_file` on "package.json" to identify:
   - Framework (Next.js, Express, etc.)
   - Test runner (Playwright, Jest, etc.)
   - Key dependencies
3. Use `read_file` on "prisma/schema.prisma" (if it exists) to understand data models
4. Use `list_directory` on "app/api" (if it exists) to find API routes
5. Use `list_directory` on "app" to find page routes
6. Use `read_file` on existing test files in "tests/" to match patterns

This discovery ensures your output matches the project's conventions and patterns.
