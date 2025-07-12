# Rungs CLI Project

A CLI tool for managing stacked diffs with Git and GitHub, making the workflow feel more native.

## Project Structure

- `src/` - Main source code
- `tests/` - Test files
- `docs/` - Documentation and specs
- `bin/` - CLI entry point

## Development Commands

- `bun run dev` - Run in development mode
- `bun test` - Run tests
- `bun run build` - Build the CLI
- `bun run cli` - Run the CLI locally

## Bun Guidelines

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build` for building
- Use `bun install` for dependencies
- Use `bun run <script>` for npm scripts
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Use Bun.$`command` instead of execa for shell commands

## Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";

test("example test", () => {
  expect(1).toBe(1);
});
```

## Dependencies

The project uses:
- GitHub CLI (`gh`) for GitHub operations
- Git for version control operations
- Bun's built-in APIs for file operations and shell commands
