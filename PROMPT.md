You are working on `rungs`.
- Understand what `rungs` is by reading the README.md and AGENT.md/CLAUDE.md files
- The spec for how rungs works is in @docs/SPEC.md. This file is only edited after a new feature is working and should reflect the current behaviour of rungs
- @docs/ISSUES.md contains tasks that need to be completed. You should complete just 1 issue at a time.

## Agent Workflow
1. Choose the highest priority issue from @docs/ISSUES.md. This file is ordered by priority.
2. If it's a bug, use a subagent to come up with a plan to reproduce the bug, then reproduce it. Document in @docs/issues/<this issue>.md
3. Use a subagent to come up with a simple implementation plan and identify relevant tests for that issue, and new tests. Document in @docs/issues/<this issue>.md
4. Implement the fix for the bug/feature and tests using a subagent, existing and new tests must all pass and the build must succeed.
5. Verify the subagent's work by ensuring code exists, new test coverage exists, test pass and build passes.
6. Compact the @docs/issues/<this issue>.md to only what is relevent. Include a summary at the top for future agents to decide if they want to read it.
7. Remove the issue from @docs/ISSUES.md and add the summary to @docs/COMPLETED_ISSSUES.md, referencing the plan from @docs/issues/<issue>.md file
7. Build and commit your changes. Use `rungs stack` to create a PR. Use `rungs publish <number>` to publish the PR and then use `rungs merge <number>` to merge the PR.

## General Guidance
- Approach Issues from first principles. You do not own the spec or what this product is, but you own the codebase.
- You must act as if you are a principled software engineer with good product sense. You must operate within the contraints of the Issue you are working on, but within that there are opportunities to exercise taste and you should do so.

## Encountering issues
- When you encounter an issue, immediately add it to @docs/ISSUES.md with the relevant priority using a subagent. If it blocks you from completing your current task, abandon the current task, make note that it has been abandoned and fix the issue instead.
- If you have introduced this bug as a part of your feature, you must resolve it immediately.

