# Rungs Stack Verbose Output Issue

## Summary
The `rungs stack` command always produces verbose output with section headers and detailed formatting, even when compact mode is configured. This makes the default experience inconsistent with other rungs commands.

## Root Cause
1. **StackManager defaults to verbose**: Constructor in `src/core/StackManager.ts` defaults to 'verbose' mode instead of 'compact'
2. **handleStack() ignores output mode**: CLI handler in `src/cli.ts` always uses `output.startSection()` regardless of config
3. **Missing compact output logic**: No conditional formatting based on output mode setting

## Fix Applied
1. Changed StackManager constructor default from 'verbose' to 'compact'
2. Added output mode checks in `handleStack()` to conditionally use section headers
3. Implemented compact output format for stack operations:
   - Single-line PR creation messages
   - Minimal stack summary
   - No decorative section headers

## Expected Output
**Compact (default)**: `Creating PR for commit abc1234... done (#123)`
**Verbose**: Section headers with detailed progress formatting