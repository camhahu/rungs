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
### Testing Rules
- Never delete tests because they don't work.
  - You're allowed to 'replace' tests that no longer are relevant. But you must replace them with new tests. .
- The full test suite must pass or you are not allowed to commit.
  - No exceptions.
  - You are responsible for fixing all the tests.
  - If new features cause regressions in old tests, even if you conclude they are unrelated, you must fix them.

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

## Work Distribution Strategy

**CRITICAL**: Always use subagents for implementation tasks. The main agent should act as taskmaster/coordinator.

### Main Agent Responsibilities
- Break down complex tasks into clear, autonomous chunks
- Coordinate multiple subagents working in parallel
- Provide clear specifications and context for each task
- Review and integrate work from subagents
- Make architectural decisions and design choices

### Subagent Usage Guidelines
- Use Task tool for all implementation work (coding, testing, documentation)
- Provide complete context and requirements in task descriptions
- Include verification steps and success criteria
- Specify exactly what should be returned/summarized
- Run multiple subagents concurrently when tasks are independent

### When to Use Subagents
- Adding new features or functionality
- Writing or updating tests
- Implementing bug fixes
- Creating or updating documentation  
- Refactoring code
- Making changes across multiple files
- **ALWAYS for updating docs/SPEC.md and docs/ISSUES.md**

### When Main Agent Acts Directly
- Reading files to understand current state
- Planning and architectural decisions
- Coordinating between subagents
- Final integration and review
- User communication and status updates

## Documentation Management

**CRITICAL**: Always keep SPEC.md and ISSUES.md current with implementation.

### Documentation Update Process
1. **Use subagents** to update docs/SPEC.md and docs/ISSUES.md
2. **After completing features**: Update ISSUES.md to mark items as complete
3. **After implementing functionality**: Update SPEC.md to reflect actual behavior
4. **When discovering gaps**: Add new items to ISSUES.md
5. **When behavior changes**: Update SPEC.md to match new implementation

### Subagent Instructions for Documentation
- For ISSUES.md: Mark completed items as `[x]`, add new discovered issues
- For SPEC.md: Update command descriptions, remove unimplemented features, add new features
- Always verify changes against actual codebase behavior
- Include specific examples that match the real implementation

## Dependencies

The project uses:
- GitHub CLI (`gh`) for GitHub operations
- Git for version control operations
- Bun's built-in APIs for file operations and shell commands

## Dogfooding Development Workflow

**CRITICAL**: Use rungs itself for all development to continuously test the tool.

### Development Process
1. **Make complete, functional commits** - Each commit should be a standalone, working change
2. **Use rungs push** - Create PRs for each logical change using the tool itself
3. **Test stacking** - Create multiple PRs to validate stack dependencies work correctly
4. **Verify behavior** - Use `rungs status` and `gh pr list` to confirm expected state
5. **Document findings** - Note any issues or improvements discovered through usage
6. Never add 'Co-authored by ...' or similar messages to commits. Commit as me.

### Commit Guidelines for Dogfooding
- **NEVER commit when tests are failing** - All tests must pass before any commit
- Each commit must build successfully (`bun run build`) 
- Each commit must pass all tests (`bun test`)
- Each commit should include updated binary if code changed
- Each commit should be a complete feature/fix that could be merged independently
- Use descriptive commit messages that will become good PR titles

### Example Dogfooding Session
```bash
# Make a small, complete improvement
git commit -m "Add better error message for missing config"
bun run build  # Ensure it works
bun test       # Ensure all tests pass

# Create PR
rungs push
rungs status  # Verify state

# Make another independent improvement  
git commit -m "Improve help text formatting"
bun run build
bun test       # Ensure all tests pass

# Create second PR (stacked)
rungs push
gh pr list --state open  # Verify both PRs exist with correct bases

# Continue with more changes...
```

This ensures rungs is constantly tested with real usage patterns.
