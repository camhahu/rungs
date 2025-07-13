# Duplicate Commit Status Bug

## Summary
**Fixed**: `rungs status` no longer shows the same commit in both the PR section and "New Commits" section when HEAD equals a stack branch tip.

## Root Cause
Bug in `getUnstakedCommits` method in `src/git-manager.ts` - algorithm ignored valid 0-commit results when HEAD matched stack branch tip, causing incorrect duplicate detection.

## Fix Applied
**File**: `src/git-manager.ts` (lines 429, 444)
1. Removed `if (commitsFromThisRef.length > 0)` condition - allows 0-commit results  
2. Fixed fallback logic to only trigger when no exclusions worked

**Test Isolation Fix**: Added proper spy cleanup in `tests/publish.test.ts` - `afterEach` blocks now restore mocked `Bun.$` to prevent global state pollution.

## Test Coverage
**New file**: `tests/git-manager-unstacked-commits.test.ts`
- Regression test reproduces original bug scenario
- Tests normal unstacked commit detection
- Tests empty stack handling 
- Tests error handling for non-existent refs

**Result**: All 175 tests pass, full test suite fixed.