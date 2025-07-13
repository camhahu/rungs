# Issue: Rename 'rungs push' to 'rungs stack'

## Summary (COMPLETED)
Successfully renamed all user-facing references from 'rungs push' to 'rungs stack' throughout the codebase. Updated 10+ files including documentation, code, and tests. All tests pass and build succeeds.

## What Was Changed
- **Code**: Renamed handlePush() to handleStack() in cli.ts
- **Documentation**: Updated all references in SPEC.md, demo files, and issue docs
- **Tests**: Updated command parsing tests to use 'stack' instead of 'push'
- **Preserved**: Internal method names like pushStack() for API consistency

## Implementation Details
See full analysis in the sections below if needed for future reference.