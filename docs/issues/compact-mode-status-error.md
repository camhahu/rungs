# Compact Mode Status Error

## Summary

The `rungs status --compact` command throws a JavaScript error: `"undefined is not an object (evaluating 'result.prs.length')"`. This prevents users from using the compact output mode for the status command.

## Steps to Reproduce

1. Run the command `rungs status --compact` 
2. The command will fail with the error message: `undefined is not an object (evaluating 'result.prs.length')`

## Root Cause Analysis

The issue is a type mismatch in the `handleStatus` function in `/Users/camhahu/Documents/Projects/rungs/src/cli.ts`:

1. **Line 200-209**: In compact mode, the code uses `tracker.stackOperation()` with a success message callback that expects `result.prs.length`
2. **Line 203**: The callback calls `await stack.getStatus()` 
3. **Line 206**: The success message callback tries to access `result.prs.length`

**The Problem**: `stack.getStatus()` returns a formatted string (line 434 in `src/stack-manager.ts`), not a `StackState` object. When the success callback tries to access `result.prs.length` on a string, it fails because strings don't have a `prs` property.

### Code Analysis

In `src/cli.ts` lines 200-209:
```typescript
const status = await tracker.stackOperation(
  "Retrieving stack status",
  async () => {
    return await stack.getStatus(); // Returns string
  },
  {
    successMessage: (result) => `Stack status retrieved - ${result.prs.length} PRs, ${result.totalCommits} commits`, // Expects StackState object
    showElapsed: true
  }
);
```

In `src/stack-manager.ts` line 434:
```typescript
async getStatus(): Promise<string> {
  // ... returns formatted status string
  return statusMessage;
}
```

The `getCurrentStack()` method (line 53 in `src/stack-manager.ts`) returns the expected `StackState` object with `prs` and `totalCommits` properties, but `getStatus()` processes this data and returns a formatted string.

## Proposed Fix Approach

There are several ways to fix this issue:

### Option 1: Modify getStatus() to return StackState data (Recommended)
- Change `getStatus()` to return both the formatted string and the raw data
- Update the return type to include both the display string and metadata
- This preserves the existing string-based display while providing data for compact mode

### Option 2: Use getCurrentStack() directly in compact mode
- In compact mode, call `stack.getCurrentStack()` instead of `stack.getStatus()`
- Format the compact success message from the StackState data
- Continue using `getStatus()` for verbose mode display

### Option 3: Create separate methods
- Keep `getStatus()` as-is for verbose mode
- Create a new `getStatusData()` method that returns StackState + additional data
- Use the appropriate method based on output mode

## Impact

- **Severity**: High - Breaks the compact mode functionality completely
- **Affected Users**: All users trying to use `--compact` or `--quiet` flags with the status command
- **Workaround**: Users can run `rungs status` without the compact flag to get verbose output