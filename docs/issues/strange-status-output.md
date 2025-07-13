# Strange Status Output Bug Analysis

## COMPLETED - Fixed July 13, 2025

**Summary**: Fixed bug where `rungs status` showed commits in both PR sections and "New Commits" section. Root cause was git log range calculation issues when HEAD equals stack branch tip, plus lack of commit SHA deduplication. Fixed with enhanced debug logging, improved logic to properly handle 0-commit results, and commit deduplication safety net.

## Issue Description
The `rungs status` command showed commit `7687399` in both PR #81 and the "New Commits (ready to push)" section.

## Root Cause
1. **Git log range calculation problem**: When HEAD equals a stack branch tip, `getUnstakedCommits()` failed to properly recognize this and incorrectly included the commit as "unstacked"
2. **Missing commit deduplication**: No safety net to prevent the same commit SHA from appearing in both PR commits and unstacked commits

## Fix Implementation
- Enhanced debug logging in `getUnstakedCommits()` to track exclusion attempts
- Fixed logic to properly accept 0-commit results when HEAD equals stack branch tip  
- Added commit SHA deduplication safety net in stack state calculation
- Added comprehensive regression tests (158+ tests pass)

## Technical Details
The bug occurred in the `getUnstakedCommits()` function in `src/git-manager.ts` which builds exclusion lists and uses `git log exclusion..HEAD` to find new commits. When the user's HEAD was exactly at the tip of an existing stack branch, the exclusion logic failed to recognize this case properly, causing the commit to be counted as both "in a PR" and "unstacked".