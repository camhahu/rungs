# Completed Issues
Include a 1 sentence summary of the issues and a reference to the /docs/issues/<file>.md where you worked on this issue

## Strange output from `rungs status` - Double counting of commits
Fixed bug where commits were appearing both in PR sections and "New Commits" section due to git log range calculation issues and lack of commit SHA deduplication. See [strange-status-output.md](issues/strange-status-output.md) for technical details.

## Rungs merge doesn't respect compact by default
Fixed `rungs merge` command to respect output mode configuration by implementing OperationTracker for compact mode (default) and preserving verbose mode when --verbose flag is provided. See [rungs-merge-verbosity.md](issues/rungs-merge-verbosity.md) for implementation details.
