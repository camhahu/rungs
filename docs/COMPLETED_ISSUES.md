# Completed Issues
Include a 1 sentence summary of the issues and a reference to the /docs/issues/<file>.md where you worked on this issue

## Strange output from `rungs status` - Double counting of commits
Fixed bug where commits were appearing both in PR sections and "New Commits" section due to git log range calculation issues and lack of commit SHA deduplication. See [strange-status-output.md](issues/strange-status-output.md) for technical details.

## Rungs merge doesn't respect compact by default
Fixed `rungs merge` command to respect output mode configuration by implementing OperationTracker for compact mode (default) and preserving verbose mode when --verbose flag is provided. See [rungs-merge-verbosity.md](issues/rungs-merge-verbosity.md) for implementation details.

## Stack misidentification after rebase operations
Fixed critical bug where commits were incorrectly identified as "unstacked" after PR merge and rebase operations due to stale remote refs and timing issues in commit detection logic. See [stack-misidentification.md](issues/stack-misidentification.md) for detailed analysis and implementation details.

## Test failure detection improvements
Created simple shell script solution to analyze bun test output and detect failures that were being missed due to long output, ensuring proper exit code checking and clear failure reporting. See [test-failure-detection.md](issues/test-failure-detection.md) for implementation details.

## Rename 'rungs push' to 'rungs stack'
Successfully renamed all user-facing references from 'rungs push' to 'rungs stack' throughout the codebase, updating 10+ files including documentation, code, and tests while preserving internal API consistency. See [rungs-push-to-stack-rename.md](issues/rungs-push-to-stack-rename.md) for implementation details.

## Config validation for first-time users
Implemented friendly error handling for missing required config values (userPrefix and defaultBranch) with clear setup instructions, preventing weird behavior on first run and providing guided configuration steps. See [config-validation-bug.md](issues/config-validation-bug.md) for implementation details.
