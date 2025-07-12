import { test, expect, beforeEach, afterEach } from "bun:test";
import { StackManager } from "../src/stack-manager";
import { ConfigManager } from "../src/config-manager";
import { GitManager } from "../src/git-manager";
import { GitHubManager } from "../src/github-manager";
import { join } from "path";
import { tmpdir } from "os";

// Integration tests using real git operations with mocked GitHub
// These test the full workflow end-to-end

class MockGitManager extends GitManager {
  async pushBranch(branchName: string, force: boolean = false): Promise<void> {
    // Mock the push operation - don't actually push to remote
  }
  
  async fetchOrigin(): Promise<void> {
    // Mock the fetch operation - don't actually fetch from remote
  }
}

class MockGitHubManager extends GitHubManager {
  private mockPRCounter = 1;
  private mockPRs: Map<string, any> = new Map();
  private mockPRsByNumber: Map<number, any> = new Map();

  async isGitHubCLIAvailable(): Promise<boolean> {
    return true;
  }

  async isAuthenticated(): Promise<boolean> {
    return true;
  }

  async createPullRequest(title: string, body: string, head: string, base: string, draft: boolean = true) {
    const prNumber = this.mockPRCounter++;
    const pr = {
      number: prNumber,
      title,
      body,
      url: `https://github.com/test/test/pull/${prNumber}`,
      draft,
      head,
      base
    };
    
    this.mockPRs.set(head, pr);
    this.mockPRsByNumber.set(prNumber, pr);
    return pr;
  }

  async updatePullRequestBase(prNumber: number, newBase: string): Promise<void> {
    const pr = this.mockPRsByNumber.get(prNumber);
    if (pr) {
      pr.base = newBase;
    }
  }

  async getPullRequest(branchName: string) {
    return this.mockPRs.get(branchName) || null;
  }

  getPullRequestByNumber(prNumber: number) {
    return this.mockPRsByNumber.get(prNumber) || null;
  }

  // Reset for each test
  reset() {
    this.mockPRCounter = 1;
    this.mockPRs.clear();
    this.mockPRsByNumber.clear();
  }
}

let tempDir: string;
let originalCwd: string;
let mockGitHub: MockGitHubManager;
let stackManager: StackManager;

beforeEach(async () => {
  // Save original directory
  originalCwd = process.cwd();
  
  // Create temp directory for test
  tempDir = join(tmpdir(), `rungs-integration-test-${Date.now()}`);
  await Bun.$`mkdir -p ${tempDir}`;
  process.chdir(tempDir);
  
  // Initialize git repo
  await Bun.$`git init`;
  await Bun.$`git config user.name "Test User"`;
  await Bun.$`git config user.email "test@example.com"`;
  
  // Add .gitignore first (before creating any rungs files)
  await Bun.write(".gitignore", ".rungs-state.json\n.rungs-config.json\n");
  
  // Create initial commit to have a proper git history
  await Bun.$`echo "initial" > README.md`;
  await Bun.$`git add .gitignore README.md`;
  await Bun.$`git commit -m "Initial commit with gitignore"`;
  
  // Set up managers (after gitignore is in place)
  const configPath = join(tempDir, ".rungs-config.json");
  const config = new ConfigManager(configPath);
  await config.set("userPrefix", "test");
  await config.set("defaultBranch", "main");
  await config.set("autoRebase", false); // Disable auto-rebase for tests (no origin remote)
  
  const git = new MockGitManager();
  mockGitHub = new MockGitHubManager();
  mockGitHub.reset();
  
  stackManager = new StackManager(config, git, mockGitHub);
});

afterEach(async () => {
  process.chdir(originalCwd);
  try {
    await Bun.$`rm -rf ${tempDir}`;
  } catch {
    // Ignore cleanup errors
  }
});

test("integration: full stacked workflow with multiple PRs", async () => {
  // Step 1: Create first set of commits
  await Bun.$`echo "feature1" >> feature1.txt`;
  await Bun.$`git add feature1.txt`;
  await Bun.$`git commit -m "Add feature 1"`;
  
  await Bun.$`echo "feature1 update" >> feature1.txt`;
  await Bun.$`git add feature1.txt`;
  await Bun.$`git commit -m "Update feature 1"`;
  
  // Create first stack
  await stackManager.pushStack();
  
  // Verify first stack was created
  const state1 = await stackManager.loadState();
  expect(state1.branches).toHaveLength(1);
  expect(state1.pullRequests).toHaveLength(1);
  expect(state1.branches[0]).toMatch(/^test\/update-feature-1/); // Branch named after latest commit
  expect(state1.pullRequests[0]).toBe(1);
  
  // Step 2: Create second set of commits
  await Bun.$`echo "feature2" >> feature2.txt`;
  await Bun.$`git add feature2.txt`;
  await Bun.$`git commit -m "Add feature 2"`;
  
  // Create second stack
  await stackManager.pushStack();
  
  // Verify second stack was created
  const state2 = await stackManager.loadState();
  expect(state2.branches).toHaveLength(2);
  expect(state2.pullRequests).toHaveLength(2);
  expect(state2.branches[1]).toMatch(/^test\/add-feature-2/);
  expect(state2.pullRequests[1]).toBe(2);
  
  // Step 3: Verify we're back on main and status is correct
  const git = new MockGitManager();
  const currentBranch = await git.getCurrentBranch();
  expect(currentBranch).toBe("main");
  
  const status = await stackManager.getStatus();
  expect(status).toContain("Active branches: 2");
  expect(status).toContain("Active PRs: 2");
  expect(status).toContain("New commits ready: 0");
});

test("integration: no commits should not create stack", async () => {
  // Try to create stack with no new commits
  await stackManager.pushStack();
  
  const state = await stackManager.loadState();
  expect(state.branches).toHaveLength(0);
  expect(state.pullRequests).toHaveLength(0);
});

test("integration: single commit creates single-commit stack", async () => {
  // Create one commit
  await Bun.$`echo "single feature" >> single.txt`;
  await Bun.$`git add single.txt`;
  await Bun.$`git commit -m "Add single feature"`;
  

  
  await stackManager.pushStack();
  
  const state = await stackManager.loadState();
  expect(state.branches).toHaveLength(1);
  expect(state.pullRequests).toHaveLength(1);
  
  // Verify PR was created correctly
  const pr = await mockGitHub.getPullRequest(state.branches[0]);
  expect(pr).toBeDefined();
  expect(pr!.title).toBe("Add single feature");
  expect(pr!.body).toContain("Single commit stack");
});

test("integration: multiple commits create multi-commit stack", async () => {
  // Create multiple commits
  await Bun.$`echo "part1" >> multi.txt`;
  await Bun.$`git add multi.txt`;
  await Bun.$`git commit -m "Add part 1"`;
  
  await Bun.$`echo "part2" >> multi.txt`;
  await Bun.$`git add multi.txt`;
  await Bun.$`git commit -m "Add part 2"`;
  
  await Bun.$`echo "part3" >> multi.txt`;
  await Bun.$`git add multi.txt`;
  await Bun.$`git commit -m "Add part 3"`;
  
  await stackManager.pushStack();
  
  const state = await stackManager.loadState();
  expect(state.branches).toHaveLength(1);
  
  // Verify PR was created with multiple commits
  const pr = await mockGitHub.getPullRequest(state.branches[0]);
  expect(pr!.title).toBe("Add part 3 (+2 more)"); // Title uses latest commit
  expect(pr!.body).toContain("Stack of 3 commits");
  expect(pr!.body).toContain("Add part 1");
  expect(pr!.body).toContain("Add part 2");
  expect(pr!.body).toContain("Add part 3");
});

test("integration: state persistence across multiple operations", async () => {
  // Create first stack
  await Bun.$`echo "first" >> first.txt`;
  await Bun.$`git add first.txt`;
  await Bun.$`git commit -m "First feature"`;
  await stackManager.pushStack();
  
  // Create new StackManager instance (simulates restart)
  const configPath = join(tempDir, ".rungs-config.json");
  const config = new ConfigManager(configPath);
  const git = new MockGitManager();
  const newStackManager = new StackManager(config, git, mockGitHub);
  
  // Verify state persisted
  const status1 = await newStackManager.getStatus();
  expect(status1).toContain("Active branches: 1");
  expect(status1).toContain("Active PRs: 1");
  
  // Create second stack with new instance
  await Bun.$`echo "second" >> second.txt`;
  await Bun.$`git add second.txt`;
  await Bun.$`git commit -m "Second feature"`;
  await newStackManager.pushStack();
  
  // Verify both stacks exist
  const status2 = await newStackManager.getStatus();
  expect(status2).toContain("Active branches: 2");
  expect(status2).toContain("Active PRs: 2");
});

test("integration: branch naming strategies work correctly", async () => {
  const configPath = join(tempDir, ".rungs-config.json");
  const config = new ConfigManager(configPath);
  
  // Test commit-message strategy (default)
  await config.set("branchNaming", "commit-message");
  await Bun.$`echo "test" >> test.txt`;
  await Bun.$`git add test.txt`;
  await Bun.$`git commit -m "Add amazing new feature"`;
  
  const git = new MockGitManager();
  const stackManager1 = new StackManager(config, git, mockGitHub);
  await stackManager1.pushStack();
  
  const state1 = await stackManager1.loadState();
  expect(state1.branches[0]).toBe("test/add-amazing-new-feature");
  
  // Reset for next test
  await Bun.$`git checkout main`;
  
  // Test sequential strategy
  await config.set("branchNaming", "sequential");
  await Bun.$`echo "test2" >> test2.txt`;
  await Bun.$`git add test2.txt`;
  await Bun.$`git commit -m "Another feature"`;
  
  const stackManager2 = new StackManager(config, git, mockGitHub);
  mockGitHub.reset(); // Reset PR counter
  await stackManager2.pushStack();
  
  const state2 = await stackManager2.loadState();
  expect(state2.branches[1]).toMatch(/^test\/stack-\d+$/);
});

test("integration: error handling for dirty working directory", async () => {
  // Create uncommitted changes
  await Bun.$`echo "uncommitted" >> dirty.txt`;
  await Bun.$`git add dirty.txt`;
  // Don't commit
  
  // Should throw error about dirty working directory
  await expect(stackManager.pushStack()).rejects.toThrow("Working directory is not clean");
});

test("integration: branch creation and cleanup", async () => {
  const git = new MockGitManager();
  
  // Verify we start on main
  expect(await git.getCurrentBranch()).toBe("main");
  
  // Create stack
  await Bun.$`echo "branch test" >> branch.txt`;
  await Bun.$`git add branch.txt`;
  await Bun.$`git commit -m "Test branch creation"`;
  await stackManager.pushStack();
  
  // Verify we're back on main after stack creation
  expect(await git.getCurrentBranch()).toBe("main");
  
  // Verify the branch was created and still exists
  const state = await stackManager.loadState();
  expect(await git.branchExists(state.branches[0])).toBe(true);
});

test("integration: rebase stack after PR merge", async () => {
  // Create initial stack with multiple PRs
  await Bun.$`echo "first commit" >> file1.txt`;
  await Bun.$`git add file1.txt`;
  await Bun.$`git commit -m "First commit"`;
  await stackManager.pushStack();
  
  await Bun.$`echo "second commit" >> file2.txt`;
  await Bun.$`git add file2.txt`;
  await Bun.$`git commit -m "Second commit"`;
  await stackManager.pushStack();
  
  await Bun.$`echo "third commit" >> file3.txt`;
  await Bun.$`git add file3.txt`;
  await Bun.$`git commit -m "Third commit"`;
  await stackManager.pushStack();
  
  // Verify we have 3 PRs
  let state = await stackManager.loadState();
  expect(state.pullRequests).toEqual([1, 2, 3]);
  expect(state.branches.length).toBe(3);
  
  // Verify initial PR bases (second PR should base on first branch, third on second)
  expect(mockGitHub.getPullRequestByNumber(1)?.base).toBe("main");
  expect(mockGitHub.getPullRequestByNumber(2)?.base).toBe(state.branches[0]);
  expect(mockGitHub.getPullRequestByNumber(3)?.base).toBe(state.branches[1]);
  
  // Simulate first PR being merged - call rebase
  await stackManager.rebaseStack(1);
  
  // Verify state was updated
  state = await stackManager.loadState();
  expect(state.pullRequests).toEqual([2, 3]);
  expect(state.branches.length).toBe(2);
  
  // Verify PR bases were updated after rebase
  expect(mockGitHub.getPullRequestByNumber(2)?.base).toBe("main");
  expect(mockGitHub.getPullRequestByNumber(3)?.base).toBe(state.branches[0]);
  
  // Simulate second PR being merged
  await stackManager.rebaseStack(2);
  
  // Verify final state
  state = await stackManager.loadState();
  expect(state.pullRequests).toEqual([3]);
  expect(state.branches.length).toBe(1);
  expect(mockGitHub.getPullRequestByNumber(3)?.base).toBe("main");
});
