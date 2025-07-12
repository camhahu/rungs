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

### Bug Fix Testing Strategy

**CRITICAL**: Every bug fix must include a regression test that reproduces the original issue and verifies the fix.

When fixing a bug:
1. First write a test that reproduces the bug (it should fail)
2. Fix the bug 
3. Verify the test now passes
4. Document the issue in tests with clear descriptions

Test categories:
- **Shell execution issues** - Test Bun shell command handling
- **GitHub CLI compatibility** - Test different gh CLI versions/flags
- **Git operations** - Test git command parsing and execution
- **Edge cases** - Test empty states, special characters, error conditions

## Documentation

### README.md Maintenance
The README.md is the primary user-facing documentation. It must be kept current and comprehensive.

**Update README when:**
- New commands or features are added
- Configuration options change
- Common user issues are discovered
- Installation process changes
- Examples become outdated

See [docs/README-MAINTENANCE.md](docs/README-MAINTENANCE.md) for detailed guidelines.

**Quality standards:**
- All code examples must work as shown
- Include realistic scenarios, not toy examples
- Cover troubleshooting for actual user issues
- Update configuration documentation when settings change

## Dependencies

The project uses:
- GitHub CLI (`gh`) for GitHub operations
- Git for version control operations
- Bun's built-in APIs for file operations and shell commands
