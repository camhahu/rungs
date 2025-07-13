import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitManager } from "../src/git-manager";
import { StackManager } from "../src/stack-manager";
import { ConfigManager } from "../src/config-manager";
import { GitHubManager } from "../src/github-manager";

describe("Stack Misidentification After Rebase Bug Fix", () => {
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
    tempDir = await mkdtemp(join(tmpdir(), "rungs-stack-misidentification-test-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Initialize git repo
    await Bun.$`git init`;
    await Bun.$`git config user.email "test@example.com"`;
    await Bun.$`git config user.name "Test User"`;
    await Bun.$`git remote add origin https://github.com/test/test-repo.git`;

    // Create initial commit
    await Bun.$`echo "initial content" > README.md`;
    await Bun.$`git add README.md`;
    await Bun.$`git commit -m "Initial commit"`;

    // Initialize managers
    configManager = new ConfigManager();
    gitManager = new GitManager();
    githubManager = new GitHubManager();
    stackManager = new StackManager(configManager, gitManager, githubManager, 'verbose');
    
    // Mock config to return test configuration
    configManager.getAll = async () => ({
      userPrefix: "user",
      defaultBranch: "main",
      autoRebase: true,
      draftPRs: true,
      branchNaming: "commit-message" as const,
      output: { mode: "verbose" as const }
    });
  });

  afterEach(async () => {
    // Restore Bun shell
    Bun.$ = originalBunShell;
    
    // Clean up
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  test("commits remain identified with PR after rebase operation", async () => {
    // Mock git commands to simulate the problematic scenario
    const mockCommits = [
      { hash: "abc123", message: "First commit", author: "Test User", date: "2023-01-01" },
      { hash: "def456", message: "Second commit (should remain in PR)", author: "Test User", date: "2023-01-02" }
    ];

    const mockPRs = [
      {
        number: 87,
        title: "Test PR",
        headRefName: "user/branch-2",
        baseRefName: "main",
        author: { login: "testuser" },
        commits: undefined, // Will be populated by populateStackCommits
        isClosed: false,
        lastCommitSha: "def456",
        url: "https://github.com/test/test-repo/pull/87",
        branch: "user/branch-2",
        base: "main"
      }
    ];

    // Mock the Bun.$ shell to return our test PR from 'gh pr list' command
    Bun.$ = (cmd: any) => {
      const cmdStr = cmd.toString();
      if (cmdStr.includes('gh pr list --author @me --state open')) {
        return {
          text: async () => JSON.stringify([{
            number: 87,
            title: "Test PR",
            url: "https://github.com/test/test-repo/pull/87",
            headRefName: "user/branch-2",
            baseRefName: "main"
          }])
        };
      }
      // For other commands, return empty/success
      return {
        text: async () => "",
        quiet: async () => {}
      };
    };

    // Mock git fetch to succeed
    gitManager.fetchOrigin = async () => {};

    // Mock getCommitsForBranch to handle the case properly
    // The new fallback logic in getCommitsForBranch means it won't throw, 
    // but will return the expected commits for the branch
    gitManager.getCommitsForBranch = async (branchName: string, baseBranch: string) => {
      if (branchName === "user/branch-2") {
        return [mockCommits[1]]; // Return the second commit that belongs to PR #87
      }
      return [];
    };

    // Mock getUnstakedCommits to return both commits initially
    gitManager.getUnstakedCommits = async () => mockCommits;

    // Run the current stack detection
    const stackState = await stackManager.getCurrentStack();

    // Verify the fix works:
    // 1. The PR should have its commit populated despite the initial remote ref failure
    expect(stackState.prs).toHaveLength(1);
    expect(stackState.prs[0].commits).toBeDefined();
    expect(stackState.prs[0].commits).toHaveLength(1);
    expect(stackState.prs[0].commits![0].hash).toBe("def456");

    // 2. The commit should NOT appear in unstacked commits (no double-counting)
    const prCommitHashes = new Set(stackState.prs.flatMap(pr => pr.commits?.map(c => c.hash) || []));
    const duplicateCommits = stackState.unstakedCommits.filter(commit => prCommitHashes.has(commit.hash));
    expect(duplicateCommits).toHaveLength(0);

    // 3. Only the first commit should appear as unstacked
    expect(stackState.unstakedCommits).toHaveLength(1);
    expect(stackState.unstakedCommits[0].hash).toBe("abc123");
  });

  test("fallback mechanisms work when remote refs are completely missing", async () => {
    const testCommit = { hash: "xyz789", message: "Test commit", author: "Test User", date: "2023-01-03" };

    // Mock git manager methods to test fallback scenarios
    gitManager.fetchOrigin = async () => {
      throw new Error("Failed to fetch from origin");
    };

    // Test the fallback method directly
    const originalGetCommitsForBranchFallback = (gitManager as any).getCommitsForBranchFallback;
    (gitManager as any).getCommitsForBranchFallback = async (branchName: string, baseBranch: string) => {
      if (branchName === "test-branch") {
        return [testCommit];
      }
      return [];
    };

    const commits = await gitManager.getCommitsForBranch("test-branch", "main");
    expect(commits).toHaveLength(1);
    expect(commits[0].hash).toBe("xyz789");
  });

  test("populateStackCommits handles fetch failures gracefully", async () => {
    const mockPR = {
      number: 88,
      title: "Another test PR",
      headRefName: "user/test-branch",
      baseRefName: "main",
      author: { login: "testuser" },
      commits: undefined,
      isClosed: false,
      lastCommitSha: "test123",
      url: "https://github.com/test/test-repo/pull/88",
      branch: "user/test-branch",
      base: "main"
    };

    // Mock fetchOrigin to fail
    gitManager.fetchOrigin = async () => {
      throw new Error("Network error");
    };

    // Mock getCommitsForBranch to return a test commit
    gitManager.getCommitsForBranch = async () => [
      { hash: "test123", message: "Test", author: "Test User", date: "2023-01-01" }
    ];

    // Call populateStackCommits directly to test error handling
    const populatedPRs = await (stackManager as any).populateStackCommits([mockPR], "main");

    // Should still work despite fetch failure
    expect(populatedPRs).toHaveLength(1);
    expect(populatedPRs[0].commits).toHaveLength(1);
    expect(populatedPRs[0].commits[0].hash).toBe("test123");
  });

  test("no double-counting when git ranges work correctly", async () => {
    const mockCommits = [
      { hash: "aaa111", message: "PR commit", author: "Test User", date: "2023-01-01" },
      { hash: "bbb222", message: "New commit", author: "Test User", date: "2023-01-02" }
    ];

    const mockPR = {
      number: 89,
      title: "Working PR",
      headRefName: "user/working-branch",
      baseRefName: "main",
      author: { login: "testuser" },
      commits: undefined,
      isClosed: false,
      lastCommitSha: "aaa111",
      url: "https://github.com/test/test-repo/pull/89",
      branch: "user/working-branch",
      base: "main"
    };

    // Mock Bun.$ to return the PR from 'gh pr list' command
    Bun.$ = (cmd: any) => {
      const cmdStr = cmd.toString();
      if (cmdStr.includes('gh pr list --author @me --state open')) {
        return {
          text: async () => JSON.stringify([{
            number: 89,
            title: "Working PR",
            url: "https://github.com/test/test-repo/pull/89",
            headRefName: "user/working-branch",
            baseRefName: "main"
          }])
        };
      }
      // For other commands, return empty/success
      return {
        text: async () => "",
        quiet: async () => {}
      };
    };
    gitManager.fetchOrigin = async () => {}; // Success
    
    // Git ranges work correctly
    gitManager.getCommitsForBranch = async (branchName: string) => {
      if (branchName === "user/working-branch") {
        return [mockCommits[0]]; // PR commit
      }
      return [];
    };

    gitManager.getUnstakedCommits = async () => mockCommits; // Both commits

    const stackState = await stackManager.getCurrentStack();

    // Verify no double-counting
    const allPRCommitHashes = stackState.prs.flatMap(pr => pr.commits?.map(c => c.hash) || []);
    const unstakedCommitHashes = stackState.unstakedCommits.map(c => c.hash);
    
    const intersection = allPRCommitHashes.filter(hash => unstakedCommitHashes.includes(hash));
    expect(intersection).toHaveLength(0);

    // Verify correct attribution
    expect(stackState.prs[0].commits).toHaveLength(1);
    expect(stackState.prs[0].commits![0].hash).toBe("aaa111");
    expect(stackState.unstakedCommits).toHaveLength(1);
    expect(stackState.unstakedCommits[0].hash).toBe("bbb222");
  });

  test("parseCommitLog handles various input formats correctly", async () => {
    const sampleLogOutput = "abc123|First commit|Test User|2023-01-01T12:00:00+00:00\ndef456|Second commit|Test User|2023-01-02T12:00:00+00:00";
    
    const parsed = (gitManager as any).parseCommitLog(sampleLogOutput);
    
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      hash: "abc123",
      message: "First commit",
      author: "Test User",
      date: "2023-01-01T12:00:00+00:00"
    });
    expect(parsed[1]).toEqual({
      hash: "def456",
      message: "Second commit", 
      author: "Test User",
      date: "2023-01-02T12:00:00+00:00"
    });
  });

  test("parseCommitLog handles empty input gracefully", async () => {
    const parsed = (gitManager as any).parseCommitLog("");
    expect(parsed).toHaveLength(0);
    
    const parsedWhitespace = (gitManager as any).parseCommitLog("   \n  ");
    expect(parsedWhitespace).toHaveLength(0);
  });
});