import { test, expect, beforeEach, afterEach } from "bun:test";
import { GitManager } from "../src/git-manager";
import { GitHubManager } from "../src/github-manager";
import { StackManager } from "../src/stack-manager";
import { ConfigManager } from "../src/config-manager";
import { join } from "path";
import { tmpdir } from "os";

// Regression tests for bugs found during development
// Each test documents a specific issue that was fixed

let tempDir: string;
let gitManager: GitManager;
let githubManager: GitHubManager;

beforeEach(async () => {
  tempDir = join(tmpdir(), `rungs-regression-test-${Date.now()}`);
  await Bun.$`mkdir -p ${tempDir}`;
  process.chdir(tempDir);
  
  // Initialize git repo for tests that need it
  await Bun.$`git init`;
  await Bun.$`git config user.name "Test User"`;
  await Bun.$`git config user.email "test@example.com"`;
  
  gitManager = new GitManager();
  githubManager = new GitHubManager();
});

afterEach(async () => {
  try {
    await Bun.$`rm -rf ${tempDir}`;
  } catch {
    // Ignore cleanup errors
  }
});

test("REGRESSION: git log with pipe characters should not be interpreted as shell pipeline", async () => {
  // BUG: Bun's shell was interpreting | in --pretty=format:%H|%s as a pipeline
  // This caused "git log origin/main..HEAD --pretty=format:%H|%s|%an|%ad" to fail
  
  // Setup: Create commits to test git log
  await Bun.$`echo "test" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Initial commit"`;
  
  await Bun.$`echo "change" >> test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Second commit"`;
  
  // This should work without shell pipeline errors
  const commits = await gitManager.getCommitsSince("HEAD~1");
  
  expect(commits).toHaveLength(1);
  expect(commits[0].message).toBe("Second commit");
  expect(commits[0].hash).toBeDefined();
  expect(commits[0].author).toBeDefined();
  expect(commits[0].date).toBeDefined();
});

test("REGRESSION: PR titles with quotes should not break shell command execution", async () => {
  // BUG: PR titles containing quotes would break the gh pr create command
  // Example: 'Add debug output for PR creation"' would create invalid shell syntax
  
  const titleWithQuotes = 'Fix "broken" functionality';
  const bodyWithQuotes = 'This fixes the "issue" we found.\n\nDetails:\n- Item with "quotes"';
  
  // Generate the command arguments that would be used
  const bodyFile = `/tmp/test-pr-body-${Date.now()}.txt`;
  await Bun.write(bodyFile, bodyWithQuotes);
  
  try {
    const args = ["echo", "gh", "pr", "create", "--title", titleWithQuotes, "--body-file", bodyFile];
    
    // This should execute without shell parsing errors
    const result = await Bun.$`${args}`.text();
    expect(result.trim()).toContain("gh pr create");
    expect(result.trim()).toContain("--title");
    expect(result.trim()).toContain(titleWithQuotes);
  } finally {
    try {
      await Bun.$`rm ${bodyFile}`.quiet();
    } catch {
      // Ignore cleanup errors
    }
  }
});

test("REGRESSION: PR title and body generation should handle special characters", async () => {
  // BUG: Commit messages with quotes, brackets, or other special chars broke PR creation
  
  const commitsWithSpecialChars = [
    { hash: "abc123", message: 'Fix "issue" with [brackets]', author: "test", date: "2023-01-01" },
    { hash: "def456", message: "Add support for <tags> & ampersands", author: "test", date: "2023-01-02" }
  ];
  
  const title = githubManager.generatePRTitle(commitsWithSpecialChars);
  const body = githubManager.generatePRBody(commitsWithSpecialChars);
  
  // Should not crash and should preserve the content
  expect(title).toContain('Fix "issue" with [brackets]');
  expect(title).toContain("(+1 more)");
  expect(body).toContain('Fix "issue" with [brackets]');
  expect(body).toContain("Add support for <tags> & ampersands");
});

test("REGRESSION: base commit detection should handle first-time usage", async () => {
  // BUG: When no lastProcessedCommit exists and origin/main doesn't exist,
  // the system would fail trying to use origin/main as base
  
  // Create a mock config and git manager
  const mockConfig = {
    userPrefix: "test",
    defaultBranch: "main",
    draftPRs: true,
    autoRebase: true,
    branchNaming: "commit-message" as const
  };
  
  // Create initial commit
  await Bun.$`echo "initial" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Initial commit"`;
  
  // Add more commits
  await Bun.$`echo "change1" >> test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "First change"`;
  
  // When origin/main doesn't exist, should fall back to root commit
  try {
    await Bun.$`git rev-parse --verify origin/main`.quiet();
    // If origin/main exists, skip this test
  } catch {
    // Good, origin/main doesn't exist, this is what we want to test
    const rootCommit = await Bun.$`git rev-list --max-parents=0 HEAD`.text();
    const commits = await gitManager.getCommitsSince(rootCommit.trim());
    
    // Should successfully get commits from root
    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0].message).toBe("First change");
  }
});

test("REGRESSION: GitHub CLI commands should use array syntax to avoid shell parsing", async () => {
  // BUG: Using template literals with GitHub CLI caused shell parsing issues
  // Solution: Use array syntax for precise argument passing
  
  const title = "Test PR with special chars: & | < > $ `";
  const body = "Body with\nnewlines and \"quotes\" and more | pipes";
  
  // Test that array syntax handles special characters correctly
  const args = ["echo", "gh", "pr", "create", "--title", title, "--head", "test-branch", "--base", "main"];
  
  const result = await Bun.$`${args}`.text();
  
  // Should execute without errors and preserve the title
  expect(result.trim()).toContain("gh pr create");
  expect(result.trim()).toContain("--title");
  expect(result.trim()).toContain("test-branch");
});

test("REGRESSION: git commands should be quiet to avoid output interference", async () => {
  // BUG: Git commands like rev-parse were outputting to stdout, interfering with other commands
  
  await Bun.$`echo "test" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Test commit"`;
  
  // These commands should not produce output that interferes with parsing
  const isRepo = await gitManager.isGitRepo();
  expect(isRepo).toBe(true);
  
  const currentBranch = await gitManager.getCurrentBranch();
  expect(typeof currentBranch).toBe("string");
  expect(currentBranch.length).toBeGreaterThan(0);
});

test("REGRESSION: branch name generation should handle edge cases", async () => {
  // BUG: Branch names could become invalid due to special characters or length
  
  const edgeCaseCommits = [
    // Very long commit message
    { 
      hash: "abc123", 
      message: "This is an extremely long commit message that goes on and on and should be truncated to avoid creating branch names that are too long for git to handle properly", 
      author: "test", 
      date: "2023-01-01" 
    },
    // Message with only special characters
    { 
      hash: "def456", 
      message: "!@#$%^&*()_+-=[]{}|;':\",./<>?", 
      author: "test", 
      date: "2023-01-02" 
    },
    // Empty message
    { 
      hash: "ghi789", 
      message: "", 
      author: "test", 
      date: "2023-01-03" 
    }
  ];
  
  for (const commit of edgeCaseCommits) {
    const branchName = gitManager.generateBranchName([commit], "user", "commit-message");
    
    // Should not be empty
    expect(branchName.length).toBeGreaterThan(0);
    
    // Should start with user prefix
    expect(branchName).toStartWith("user/");
    
    // Should not exceed reasonable length
    expect(branchName.length).toBeLessThan(100);
    
    // Should not contain invalid characters for git branch names
    expect(branchName).not.toMatch(/[^a-z0-9\-\/]/);
  }
});

test("REGRESSION: empty commit list should be handled gracefully", async () => {
  // BUG: Various functions would fail when given empty commit arrays
  
  const emptyCommits: any[] = [];
  
  // Should not crash and should return sensible defaults
  const title = githubManager.generatePRTitle(emptyCommits);
  expect(title).toBe("Empty stack");
  
  const body = githubManager.generatePRBody(emptyCommits);
  expect(body).toBe("Empty stack - no commits to include.");
  
  const branchName = gitManager.generateBranchName(emptyCommits, "user", "commit-message");
  expect(branchName).toMatch(/^user\/empty-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
});
