# Stack Misidentification After Rebase Bug

## ✅ RESOLVED - July 2025

**Issue Status**: COMPLETED  
**Solution**: Fixed remote ref fetching and implemented fallback mechanisms for commit detection after rebase operations.

**Key Changes Made**:
- Added remote ref synchronization before commit detection in `populateStackCommits`
- Implemented fallback commit detection mechanisms in `getCommitsForBranch`
- Enhanced test coverage with regression tests to prevent future occurrences
- Fixed timing issues where stale remote refs caused incorrect stack attribution

**Result**: Commits now correctly remain associated with their PRs after merge operations that trigger rebasing, eliminating the double-counting bug where commits appeared in both PR sections and "New Commits" sections.

---

## Original Issue Summary
A commit is mistakenly identified as not belonging to an open stack after a rebase operation. Specifically, after merging a PR with `rungs merge`, which triggers automatic base updates and rebasing of dependent PRs, the status command incorrectly shows commits that should belong to existing PRs as "unstacked" new commits.

## Bug Scenario
1. User has two commits and two open PRs/stacks respectively
2. User merges the first commit with `rungs merge`
3. Rungs correctly updates the second stack to rebase onto `main` 
4. User creates a new commit and runs `rungs status`
5. Rungs mistakenly reports that both:
   - The new commit (which should be unstacked) ✓ correct
   - The commit from PR #87 (which should belong to that PR) ❌ **incorrect**

## Root Cause Analysis

The issue stems from how commits are populated for PRs after a rebase operation in the `populateStackCommits` method:

### Current Flow (Problematic)
1. **Merge Process**: When merging PR #1, the system correctly:
   - Updates PR #2's base from `user/branch-1` → `main`
   - Rebases PR #2's branch onto `main`
   - Updates commit hashes due to rebase

2. **Status Retrieval**: When `rungs status` is called:
   - `getCurrentStack()` fetches PR metadata from GitHub (✓ correct)
   - `populateStackCommits()` calls `getCommitsForBranch(pr.branch, pr.base)` 
   - For PR #87: `getCommitsForBranch("user/branch-2", "main")`
   - Uses git range: `origin/main..origin/user/branch-2`

3. **The Problem**: `getCommitsForBranch` may return empty results because:
   - **Remote Sync Issue**: `origin/user/branch-2` might not reflect the latest rebased commits
   - **Timing Issue**: The rebase operation updated local refs but remote refs haven't been fetched
   - **Hash Mismatch**: After rebase, commit hashes changed, but remote tracking isn't updated

4. **Deduplication Logic**: In `getCurrentStack()` (lines 108-114):
   ```typescript
   const prCommitHashes = new Set(prsWithCommits.flatMap(pr => 
     pr.commits?.map(c => c.hash) || []
   ));
   const deduplicatedUnstacked = unstakedCommits.filter(commit => 
     !prCommitHashes.has(commit.hash)
   );
   ```
   - If `pr.commits` is empty (due to the issue above), then `prCommitHashes` doesn't contain the rebased commit hash
   - `getUnstakedCommits` finds the rebased commit via local HEAD traversal
   - The commit appears in "unstacked" because it's not excluded by the empty `prCommitHashes`

### Key Files Involved
- **`src/stack-manager.ts`**: Lines 617-637 (`populateStackCommits`)
- **`src/git-manager.ts`**: Lines 372-403 (`getCommitsForBranch`)
- **`src/stack-manager.ts`**: Lines 104-114 (deduplication logic)

## Reproduction Steps

1. **Setup**: Create a repository with two commits on main
2. **Create Stack**: 
   ```bash
   rungs push  # Creates PR #1 with commit 1
   # Add second commit
   rungs push  # Creates PR #2 with commit 2, based on PR #1
   ```
3. **Trigger Bug**:
   ```bash
   rungs merge <PR#1>  # Merges first PR, rebases second PR
   # Add a third commit
   rungs status        # Shows both commit 2 and commit 3 as "unstacked"
   ```

## Expected vs Actual Behavior

**Expected**:
- Stack Status: 1 PR
- PR #87 with commit aae9cfe (rebased)  
- New Commits: 1
- f2829bc (new local commit)

**Actual**:
- Stack Status: 1 PR  
- PR #87 with (no commits shown)
- New Commits: 2
- f2829bc (new local commit) ✓ 
- aae9cfe (should belong to PR #87) ❌

## Implementation Plan

### 1. Improve Remote Ref Synchronization
**File**: `src/stack-manager.ts` - `populateStackCommits` method

Before calling `getCommitsForBranch`, ensure remote refs are up-to-date:
```typescript
private async populateStackCommits(stackPRs: StackPR[], defaultBranch: string): Promise<StackPR[]> {
  // Fetch latest remote refs to ensure accurate commit detection
  await this.git.fetchOrigin();
  
  const populatedPRs: StackPR[] = [];
  
  for (const pr of stackPRs) {
    try {
      const commits = await this.git.getCommitsForBranch(pr.branch, pr.base);
      // ... rest unchanged
    }
  }
}
```

### 2. Add Fallback Commit Detection
**File**: `src/git-manager.ts` - `getCommitsForBranch` method

If the primary method returns empty, use GitHub API or alternative git commands:
```typescript
async getCommitsForBranch(branchName: string, baseBranch: string = "main"): Promise<GitCommit[]> {
  try {
    const result = await Bun.$`git log origin/${baseBranch}..origin/${branchName} '--pretty=format:%H|%s|%an|%ad' --date=iso`.text();
    
    if (!result.trim()) {
      // Fallback: try with local refs if remote is stale
      return await this.getCommitsForBranchFallback(branchName, baseBranch);
    }
    
    return this.parseCommitLog(result);
  } catch (error) {
    // Existing fallback logic...
  }
}
```

### 3. Enhanced Debugging
Add debug logging to understand when the mismatch occurs:
```typescript
if (this.outputMode === 'verbose') {
  logInfo(`Populating commits for PR #${pr.number}: ${pr.branch} (base: ${pr.base})`, 1);
  logInfo(`Found ${commits.length} commits`, 2);
}
```

### 4. Alternative: Use GitHub API for Commit Detection
Instead of relying solely on git ranges, cross-reference with GitHub's PR commit API:
```typescript
// In github-manager.ts
async getCommitsForPR(prNumber: number): Promise<GitCommit[]> {
  const result = await Bun.$`gh pr view ${prNumber} --json commits`.text();
  const data = JSON.parse(result);
  return data.commits.map(c => ({
    hash: c.oid,
    message: c.messageHeadline,
    author: c.author.name,
    date: c.committedDate
  }));
}
```

## Test Plan

### 1. Regression Test
**File**: `tests/stack-misidentification.test.ts`
```typescript
test("commits remain identified with PR after rebase", async () => {
  // Setup: Create 2-commit stack
  // Merge first PR (triggers rebase)
  // Add new commit
  // Verify: status shows correct attribution
});
```

### 2. Integration Test  
```typescript
test("status command after merge shows correct stack state", async () => {
  // Full end-to-end scenario
  // Verify no commits appear in both PR and unstacked sections
});
```

### 3. Unit Tests
```typescript
test("populateStackCommits handles stale remote refs", async () => {
  // Mock stale remote refs
  // Verify fallback behavior works
});

test("getCommitsForBranch with changed base branch", async () => {
  // Test commit detection after base change
});
```

## Success Criteria

1. **No Double-Counting**: Commits never appear in both PR section and "New Commits" section
2. **Accurate Attribution**: After rebase, commits correctly remain associated with their PRs
3. **Robust Sync**: Status command works correctly even with stale remote refs
4. **Clear Output**: Status clearly shows which commits belong to which PRs

This fix will ensure the stack state remains consistent and accurate after merge operations that trigger rebasing.