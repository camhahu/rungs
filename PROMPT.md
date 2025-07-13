You are working on `rungs`.
- Understand what `rungs` is by reading the README.md and AGENT.md/CLAUDE.md files
- The spec for how rungs works is in @docs/SPEC.md. This file is only edited after a new feature is working and should reflect the current behaviour of rungs
- @docs/ISSUES.md contains tasks that need to be completed. You should complete just 1 issue at a time.

## Agent Workflow
1. Choose the highest priority issue from @docs/ISSUES.md. This file is ordered by priority.
2. If it's a bug, use a subagent to come up with a plan to reproduce the bug, then reproduce it. Document in @docs/issues/<this issue>.md
3. Use a subagent to come up with a simple implementation plan and identify relevant tests for that issue, and new tests. Document in @docs/issues/<this issue>.md
4. Implement the bug/feature and tests using a subagent, existing and new tests must all pass and the build must succeed.
5. Compact the @docs/issues/<this issue>.md to only what is relevent. Include a summary at the top for future agents to decide if they want to read it.
6. Build and commit your code. Use `rungs` itself to create the PR.

## Encountering issues
- When you encounter an issue, immediately add it to @docs/ISSUES.md with the relevant priority using a subagent. If it blocks you from completing your current task, abandon the current task, make note that it has been abandoned and fix the issue instead.

