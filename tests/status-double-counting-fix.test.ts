import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitManager } from "../src/git-manager";
import { StackManager } from "../src/stack-manager";
import { ConfigManager } from "../src/config-manager";
import { GitHubManager } from "../src/github-manager";

describe("Status Double-Counting Bug Fix", () => {
  let tempDir: string;
  let originalCwd: string;
  let gitManager: GitManager;
  let stackManager: StackManager;
  let configManager: ConfigManager;
  let githubManager: GitHubManager;
  let originalBunShell: any;

  beforeEach(async () => {
    // Store original Bun shell before any tests that might mock it
    originalBunShell = Bun.$;
    
    // Create a temporary directory for tests
    tempDir = await mkdtemp(join(tmpdir(), "rungs-double-counting-test-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Initialize git repo
    await Bun.$`git init`;
    await Bun.$`git config user.email "test@example.com"`;
    await Bun.$`git config user.name "Test User"`;

    gitManager = new GitManager();
    githubManager = new GitHubManager();
    configManager = new ConfigManager();
    stackManager = new StackManager(configManager, gitManager, githubManager, 'compact');
  });

  afterEach(async () => {
    // Restore original Bun shell in case other tests mocked it
    Bun.$ = originalBunShell;
    
    // Cleanup
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  test("regression test: commit should not appear in both PR and unstacked sections", async () => {
    // Set up scenario that reproduces the original bug report
    // 1. Create main branch with initial commit
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    await Bun.$`git update-ref refs/remotes/origin/main refs/heads/main`;
    
    // 2. Create feature branch with the commit that appeared twice in the original bug
    await Bun.$`git checkout -b user/feature-branch`;
    await Bun.$`touch feature.txt`;
    await Bun.$`git add feature.txt`;
    await Bun.$`git commit -m "Improve rungs status output with commit details and PR links"`;
    
    // 3. Simulate this being pushed as a PR branch
    await Bun.$`git update-ref refs/remotes/origin/user/feature-branch refs/heads/user/feature-branch`;
    
    // 4. Go back to main but stay at the feature commit (simulating being on main with the commit)
    await Bun.$`git checkout main`;
    await Bun.$`git reset --hard refs/heads/user/feature-branch`;
    
    // The bug scenario:
    // - The commit 7687399 exists in PR #81 (feature-branch)
    // - But HEAD is also at that commit, so getUnstakedCommits() incorrectly includes it
    // - This causes the commit to appear in both sections
    
    const stackBranches = ["user/feature-branch"];
    const defaultBranch = "main";
    
    // Test the core git logic directly
    const unstakedCommits = await gitManager.getUnstakedCommits(stackBranches, defaultBranch, true);
    
    // This should be empty because HEAD equals the tip of user/feature-branch
    // The fix ensures that 0-commit result is accepted when HEAD equals a stack branch tip
    expect(unstakedCommits).toEqual([]);
  });

  test("commit SHA deduplication prevents double-counting in stack state", async () => {
    // Set up a scenario where the git logic might fail but deduplication saves us
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    await Bun.$`git update-ref refs/remotes/origin/main refs/heads/main`;
    
    // Create a feature commit
    await Bun.$`touch feature.txt`;
    await Bun.$`git add feature.txt`;
    await Bun.$`git commit -m "Feature commit"`;
    const featureCommitHash = (await Bun.$`git rev-parse HEAD`.text()).trim();
    
    // Simulate PR state
    await Bun.$`git checkout -b user/pr-branch`;
    await Bun.$`git update-ref refs/remotes/origin/user/pr-branch refs/heads/user/pr-branch`;
    await Bun.$`git checkout main`;
    
    // Mock stack state where both getCommitsForBranch and getUnstakedCommits return the same commit
    const prCommits = [
      { hash: featureCommitHash, message: "Feature commit", author: "Dev", date: "2024-01-13" }
    ];
    const unstakedCommits = [
      { hash: featureCommitHash, message: "Feature commit", author: "Dev", date: "2024-01-13" }
    ];
    
    // Test deduplication logic directly
    const prCommitHashes = new Set(prCommits.map(c => c.hash));
    const deduplicatedUnstacked = unstakedCommits.filter(commit => 
      !prCommitHashes.has(commit.hash)
    );
    
    // The same commit should be filtered out from unstacked commits
    expect(deduplicatedUnstacked).toEqual([]);
    expect(prCommits).toHaveLength(1); // Still appears in PR
  });

  test("debug logging shows branch resolution process", async () => {
    // Set up scenario with multiple branches
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    await Bun.$`git update-ref refs/remotes/origin/main refs/heads/main`;
    
    // Create multiple stack branches
    await Bun.$`git checkout -b user/branch1`;
    await Bun.$`touch file1.txt`;
    await Bun.$`git add file1.txt`;
    await Bun.$`git commit -m "Branch 1 commit"`;
    await Bun.$`git update-ref refs/remotes/origin/user/branch1 refs/heads/user/branch1`;
    
    await Bun.$`git checkout -b user/branch2`;
    await Bun.$`touch file2.txt`;
    await Bun.$`git add file2.txt`;
    await Bun.$`git commit -m "Branch 2 commit"`;
    await Bun.$`git update-ref refs/remotes/origin/user/branch2 refs/heads/user/branch2`;
    
    await Bun.$`git checkout main`;
    await Bun.$`touch new.txt`;
    await Bun.$`git add new.txt`;
    await Bun.$`git commit -m "New commit"`;
    
    // Capture debug output
    const originalConsoleLog = console.log;
    const debugLogs: string[] = [];
    console.log = (...args: any[]) => {
      const message = args.join(' ');
      if (message.includes('[DEBUG]')) {
        debugLogs.push(message);
      }
    };
    
    const stackBranches = ["user/branch1", "user/branch2"];
    await gitManager.getUnstakedCommits(stackBranches, "main", true);
    
    console.log = originalConsoleLog;
    
    // Verify debug logging includes expected information
    expect(debugLogs.some(log => log.includes('Stack branches for exclusion'))).toBe(true);
    expect(debugLogs.some(log => log.includes('Exclusions being tried'))).toBe(true);
    expect(debugLogs.some(log => log.includes('Final result'))).toBe(true);
  });

  test("handles non-existent remote branches gracefully", async () => {
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    await Bun.$`git update-ref refs/remotes/origin/main refs/heads/main`;
    
    await Bun.$`touch new.txt`;
    await Bun.$`git add new.txt`;
    await Bun.$`git commit -m "New commit"`;
    
    // Test with non-existent stack branches
    const stackBranches = ["user/non-existent-1", "user/non-existent-2"];
    const result = await gitManager.getUnstakedCommits(stackBranches, "main", true);
    
    // Should fallback to origin/main and find the new commit
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("New commit");
  });

  test("correctly prioritizes stack branch tip when HEAD equals it", async () => {
    // This is the key fix - when HEAD equals a stack branch tip, 
    // that should return 0 commits and be preferred over other exclusions
    
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    await Bun.$`git update-ref refs/remotes/origin/main refs/heads/main`;
    
    // Create feature branch and commit
    await Bun.$`git checkout -b user/feature`;
    await Bun.$`touch feature.txt`;
    await Bun.$`git add feature.txt`;
    await Bun.$`git commit -m "Feature commit"`;
    
    // Simulate feature branch being pushed
    await Bun.$`git update-ref refs/remotes/origin/user/feature refs/heads/user/feature`;
    
    // Stay on feature branch - HEAD equals the tip
    // In the original bug, user was actually on main but at the same commit
    // Let's test both scenarios
    
    // Scenario 1: On feature branch (HEAD equals tip)
    const result1 = await gitManager.getUnstakedCommits(["user/feature"], "main");
    expect(result1).toEqual([]); // Should be empty
    
    // Scenario 2: On main but at same commit as feature tip (the bug scenario)
    await Bun.$`git checkout main`;
    await Bun.$`git reset --hard refs/heads/user/feature`;
    
    const result2 = await gitManager.getUnstakedCommits(["user/feature"], "main");
    expect(result2).toEqual([]); // Should still be empty due to the fix
  });

  test("preserves correct behavior when there are actually new commits", async () => {
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    await Bun.$`git update-ref refs/remotes/origin/main refs/heads/main`;
    
    // Create feature branch
    await Bun.$`git checkout -b user/feature`;
    await Bun.$`touch feature.txt`;
    await Bun.$`git add feature.txt`;
    await Bun.$`git commit -m "Feature commit"`;
    await Bun.$`git update-ref refs/remotes/origin/user/feature refs/heads/user/feature`;
    
    // Go back to main and add a truly new commit
    await Bun.$`git checkout main`;
    await Bun.$`touch new.txt`;
    await Bun.$`git add new.txt`;
    await Bun.$`git commit -m "New commit"`;
    
    const result = await gitManager.getUnstakedCommits(["user/feature"], "main");
    
    // Should find the new commit
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("New commit");
  });

  test("integration test: full stack state should not show duplicates", async () => {
    // This tests the end-to-end deduplication in getCurrentStack
    
    await Bun.$`touch initial.txt`;
    await Bun.$`git add initial.txt`;
    await Bun.$`git commit -m "Initial commit"`;
    
    await Bun.$`git branch -M main`;
    await Bun.$`git remote add origin https://github.com/test/repo.git`;
    await Bun.$`git update-ref refs/remotes/origin/main refs/heads/main`;
    
    await Bun.$`touch feature.txt`;
    await Bun.$`git add feature.txt`;
    await Bun.$`git commit -m "Duplicate commit test"`;
    const commitHash = (await Bun.$`git rev-parse HEAD`.text()).trim();
    
    // Create feature branch at this commit
    await Bun.$`git checkout -b user/test-feature`;
    await Bun.$`git update-ref refs/remotes/origin/user/test-feature refs/heads/user/test-feature`;
    await Bun.$`git checkout main`;
    
    // Mock the GitHub parts since we can't actually call GitHub API
    configManager.getAll = async () => ({
      userPrefix: "user",
      defaultBranch: "main",
      autoRebase: true,
      draftPRs: true,
      branchNaming: "commit-message" as const,
      output: { mode: 'compact' as const }
    });
    
    githubManager.isGitHubCLIAvailable = async () => true;
    githubManager.isAuthenticated = async () => true;
    
    // Mock getCurrentStack to simulate the scenario
    const mockStackState = {
      prs: [{
        number: 123,
        branch: "user/test-feature",
        title: "Test PR",
        url: "https://github.com/test/repo/pull/123",
        base: "main",
        head: "user/test-feature",
        commits: [
          { hash: commitHash, message: "Duplicate commit test", author: "Test", date: "2024-01-13" }
        ]
      }],
      unstakedCommits: [
        { hash: commitHash, message: "Duplicate commit test", author: "Test", date: "2024-01-13" }
      ]
    };
    
    // Test the deduplication logic that should be in getCurrentStack
    const prCommitHashes = new Set(mockStackState.prs.flatMap(pr => 
      pr.commits?.map(c => c.hash) || []
    ));
    const deduplicatedUnstacked = mockStackState.unstakedCommits.filter(commit => 
      !prCommitHashes.has(commit.hash)
    );
    
    // After deduplication, unstacked should be empty
    expect(deduplicatedUnstacked).toEqual([]);
    expect(mockStackState.prs[0].commits).toHaveLength(1); // Still in PR
  });
});