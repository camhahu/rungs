# Test Restack Fix

This file tests that the fetchBranch fix resolves the automatic restack issue.

The fix changes `git fetch origin branch:branch` to `git fetch origin branch` to avoid conflicts when local and remote branches have diverged.

## Expected Behavior

After squash-merging the parent PR, the child PR should automatically rebase to remove duplicate commits.
