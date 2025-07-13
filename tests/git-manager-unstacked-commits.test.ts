import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitManager } from "../src/git-manager";

describe("GitManager - getUnstakedCommits", () => {
  let tempDir: string;
  let originalCwd: string;
  let gitManager: GitManager;
  let originalBunShell: any;

  beforeEach(async () => {
    // Store original Bun shell before any tests that might mock it
    originalBunShell = Bun.$;
    
    // Create a temporary directory for tests
    tempDir = await mkdtemp(join(tmpdir(), "rungs-git-manager-test-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Initialize git repo
    await Bun.$`git init`;
    await Bun.$`git config user.email "test@example.com"`;
    await Bun.$`git config user.name "Test User"`;

    gitManager = new GitManager();
  });

  afterEach(async () => {
    // Restore original Bun shell in case other tests mocked it
    Bun.$ = originalBunShell;
    
    // Cleanup
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns empty array when HEAD equals stack branch tip (regression test)", async () => {
    // Set up scenario: create main branch with initial commit
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    // Create and push main branch
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    await Bun.$`git update-ref refs/remotes/origin/main refs/heads/main`;
    
    // Create a feature branch and commit
    await Bun.$`git checkout -b feature-branch`;
    await Bun.$`touch feature.txt`;
    await Bun.$`git add feature.txt`;
    await Bun.$`git commit -m "Add feature"`;
    
    // Simulate the feature-branch being pushed at current HEAD
    await Bun.$`git update-ref refs/remotes/origin/feature-branch refs/heads/feature-branch`;
    
    // The bug scenario: 
    // - origin/main exists and has some commits from HEAD (will return 1 commit)
    // - origin/feature-branch exists and equals HEAD (will return 0 commits)
    // The old code would ignore the 0-commit result and use the 1-commit result instead
    // The fix should allow the 0-commit result to be accepted as the "smallest"
    
    const stackBranches = ["feature-branch"];
    const defaultBranch = "main";
    
    const result = await gitManager.getUnstakedCommits(stackBranches, defaultBranch);
    
    // This should be empty because HEAD equals the tip of feature-branch
    // which gives 0 commits, and 0 < 1 so it should be preferred over origin/main
    expect(result).toEqual([]);
  });

  test("correctly identifies unstacked commits when there are new commits", async () => {
    // Set up scenario: main branch
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    await Bun.$`git update-ref refs/remotes/origin/main refs/heads/main`;
    
    // Add new commit on main 
    await Bun.$`touch feature1.txt`;
    await Bun.$`git add feature1.txt`;
    await Bun.$`git commit -m "Add feature 1"`;
    
    await Bun.$`touch feature2.txt`;
    await Bun.$`git add feature2.txt`;
    await Bun.$`git commit -m "Add feature 2"`;
    
    // Create feature branch pointing to the first new commit
    await Bun.$`git branch feature-branch HEAD~1`;
    // Simulate feature-branch being pushed 
    await Bun.$`git update-ref refs/remotes/origin/feature-branch refs/heads/feature-branch`;
    
    // Now HEAD has one commit ahead of origin/feature-branch
    const stackBranches = ["feature-branch"];
    const defaultBranch = "main";
    
    const result = await gitManager.getUnstakedCommits(stackBranches, defaultBranch);
    
    // Should return the one new commit
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Add feature 2");
  });

  test("handles empty stack branches correctly", async () => {
    // Set up scenario: main branch with two commits
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    
    // Add a new commit
    await Bun.$`touch new.txt`;
    await Bun.$`git add new.txt`;
    await Bun.$`git commit -m "New commit"`;
    
    // Set origin/main to the first commit so we have one unstacked commit
    await Bun.$`git update-ref refs/remotes/origin/main HEAD~1`;
    
    const stackBranches: string[] = [];
    const defaultBranch = "main";
    
    const result = await gitManager.getUnstakedCommits(stackBranches, defaultBranch);
    
    // Should return the new commit
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("New commit");
  });

  test("handles non-existent remote refs gracefully", async () => {
    // Set up scenario: local only repo
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    
    // Add another commit
    await Bun.$`touch new.txt`;
    await Bun.$`git add new.txt`;
    await Bun.$`git commit -m "New commit"`;
    
    const stackBranches = ["non-existent-branch"];
    const defaultBranch = "main";
    
    const result = await gitManager.getUnstakedCommits(stackBranches, defaultBranch);
    
    // Should handle gracefully and fall back to default behavior
    expect(Array.isArray(result)).toBe(true);
  });
});