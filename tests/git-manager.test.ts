import { test, expect, beforeEach, afterEach } from "bun:test";
import { GitManager } from "../src/git-manager";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;
let gitManager: GitManager;

beforeEach(async () => {
  tempDir = join(tmpdir(), `rungs-git-test-${Date.now()}`);
  await Bun.$`mkdir -p ${tempDir}`;
  process.chdir(tempDir);
  
  // Initialize git repo
  await Bun.$`git init`;
  await Bun.$`git config user.name "Test User"`;
  await Bun.$`git config user.email "test@example.com"`;
  
  gitManager = new GitManager();
});

afterEach(async () => {
  try {
    await Bun.$`rm -rf ${tempDir}`;
  } catch {
    // Ignore cleanup errors
  }
});

test("should detect git repository", async () => {
  const isGitRepo = await gitManager.isGitRepo();
  expect(isGitRepo).toBe(true);
});

test("should get current branch", async () => {
  // Create initial commit to have a proper branch
  await Bun.$`echo "test" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Initial commit"`;
  
  const branch = await gitManager.getCurrentBranch();
  expect(typeof branch).toBe("string");
  expect(branch.length).toBeGreaterThan(0);
});

test("should get git status", async () => {
  // Create initial commit
  await Bun.$`echo "test" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Initial commit"`;
  
  const status = await gitManager.getStatus();
  
  expect(status.currentBranch).toBeDefined();
  expect(typeof status.isClean).toBe("boolean");
  expect(typeof status.ahead).toBe("number");
  expect(typeof status.behind).toBe("number");
});

test("should detect clean working directory", async () => {
  // Create and commit a file
  await Bun.$`echo "test" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Initial commit"`;
  
  const status = await gitManager.getStatus();
  expect(status.isClean).toBe(true);
});

test("should detect dirty working directory", async () => {
  // Create initial commit
  await Bun.$`echo "test" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Initial commit"`;
  
  // Make working directory dirty
  await Bun.$`echo "modified" >> test.txt`;
  
  const status = await gitManager.getStatus();
  expect(status.isClean).toBe(false);
});

test("should create new branch", async () => {
  // Create initial commit
  await Bun.$`echo "test" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Initial commit"`;
  
  const branchName = "test-branch";
  await gitManager.createBranch(branchName);
  
  const currentBranch = await gitManager.getCurrentBranch();
  expect(currentBranch).toBe(branchName);
});

test("should check if branch exists", async () => {
  // Create initial commit and branch
  await Bun.$`echo "test" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Initial commit"`;
  
  const currentBranch = await gitManager.getCurrentBranch();
  const exists = await gitManager.branchExists(currentBranch);
  expect(exists).toBe(true);
  
  const nonExistent = await gitManager.branchExists("non-existent-branch");
  expect(nonExistent).toBe(false);
});

test("should get commits since base", async () => {
  // Create initial commit on main
  await Bun.$`echo "initial" > test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Initial commit"`;
  
  const initialBranch = await gitManager.getCurrentBranch();
  
  // Create some commits
  await Bun.$`echo "change1" >> test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "First change"`;
  
  await Bun.$`echo "change2" >> test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Second change"`;
  
  // Get commits since the first commit
  const commits = await gitManager.getCommitsSince(`${initialBranch}~2`);
  
  expect(commits).toHaveLength(2);
  expect(commits[0].message).toBe("Second change");
  expect(commits[1].message).toBe("First change");
});

test("should generate branch names correctly", async () => {
  const commits = [
    { hash: "abc123", message: "Add user authentication", author: "test", date: "2023-01-01" },
    { hash: "def456", message: "Fix login bug", author: "test", date: "2023-01-02" }
  ];
  
  // Test commit-message strategy
  const commitMessageBranch = gitManager.generateBranchName(commits, "john", "commit-message");
  expect(commitMessageBranch).toBe("john/add-user-authentication");
  
  // Test sequential strategy
  const sequentialBranch = gitManager.generateBranchName(commits, "john", "sequential");
  expect(sequentialBranch).toMatch(/^john\/stack-\d+$/);
  
  // Test timestamp strategy
  const timestampBranch = gitManager.generateBranchName(commits, "john", "timestamp");
  expect(timestampBranch).toMatch(/^john\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
});

test("should handle empty commit list for branch naming", async () => {
  const emptyCommits: any[] = [];
  
  const branchName = gitManager.generateBranchName(emptyCommits, "john", "commit-message");
  expect(branchName).toMatch(/^john\/empty-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
});

test("should clean commit messages for branch names", async () => {
  const commits = [
    { hash: "abc123", message: "Fix: issue with special chars!!! @#$%", author: "test", date: "2023-01-01" }
  ];
  
  const branchName = gitManager.generateBranchName(commits, "john", "commit-message");
  expect(branchName).toBe("john/fix-issue-with-special-chars");
});
