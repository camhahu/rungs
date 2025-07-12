import { test, expect, beforeEach, afterEach } from "bun:test";
import { StackManager } from "../src/stack-manager";
import { ConfigManager } from "../src/config-manager";
import { GitManager } from "../src/git-manager";
import { GitHubManager } from "../src/github-manager";
import { join } from "path";
import { tmpdir } from "os";

// Mock implementations for testing StackManager logic
class MockConfigManager {
  private config = {
    userPrefix: "test",
    defaultBranch: "main", 
    draftPRs: true,
    autoRebase: true,
    branchNaming: "commit-message" as const
  };

  async getAll() {
    return this.config;
  }

  async get(key: keyof typeof this.config) {
    return this.config[key];
  }
}

class MockGitManager {
  private mockBranch = "main";
  private mockStatus = { currentBranch: "main", isClean: true, ahead: 0, behind: 0 };
  private mockCommits: any[] = [];

  async isGitRepo() { return true; }
  async getCurrentBranch() { return this.mockBranch; }
  async getStatus() { return this.mockStatus; }
  async getCommitsSince(base: string) { return this.mockCommits; }
  async fetchOrigin() { }
  async rebaseOnto(branch: string) { }
  async createBranch(name: string) { this.mockBranch = name; }
  async checkoutBranch(name: string) { this.mockBranch = name; }
  async branchExists(name: string) { return false; }
  async pushBranch(name: string) { }
  
  generateBranchName(commits: any[], prefix: string, strategy: string) {
    return `${prefix}/test-branch`;
  }

  // Test helpers
  setMockStatus(status: Partial<typeof this.mockStatus>) {
    this.mockStatus = { ...this.mockStatus, ...status };
  }

  setMockCommits(commits: any[]) {
    this.mockCommits = commits;
  }
}

class MockGitHubManager {
  async isGitHubCLIAvailable() { return true; }
  async isAuthenticated() { return true; }
  
  async createPullRequest(title: string, body: string, head: string, base: string, draft: boolean) {
    return {
      number: 123,
      title,
      body,
      url: "https://github.com/test/test/pull/123",
      draft,
      head,
      base
    };
  }

  generatePRTitle(commits: any[]) {
    return commits.length > 0 ? commits[0].message : "Empty stack";
  }

  generatePRBody(commits: any[]) {
    return `Stack of ${commits.length} commits`;
  }
}

let tempDir: string;
let stackManager: StackManager;
let mockConfig: MockConfigManager;
let mockGit: MockGitManager;
let mockGitHub: MockGitHubManager;

beforeEach(async () => {
  tempDir = join(tmpdir(), `rungs-stack-test-${Date.now()}`);
  await Bun.$`mkdir -p ${tempDir}`;
  process.chdir(tempDir);

  mockConfig = new MockConfigManager();
  mockGit = new MockGitManager();
  mockGitHub = new MockGitHubManager();
  
  stackManager = new StackManager(
    mockConfig as any,
    mockGit as any,
    mockGitHub as any
  );
});

afterEach(async () => {
  try {
    await Bun.$`rm -rf ${tempDir}`;
  } catch {
    // Ignore cleanup errors
  }
});

test("should load empty state when no state file exists", async () => {
  const state = await stackManager.loadState();
  
  expect(state.branches).toEqual([]);
  expect(state.pullRequests).toEqual([]);
  expect(state.lastProcessedCommit).toBeUndefined();
});

test("should save and load state correctly", async () => {
  const testState = {
    lastProcessedCommit: "abc123",
    branches: ["test/branch1", "test/branch2"],
    pullRequests: [123, 456]
  };

  await stackManager.saveState(testState);
  const loadedState = await stackManager.loadState();

  expect(loadedState).toEqual(testState);
});

test("should handle corrupted state file gracefully", async () => {
  // Write invalid JSON to state file
  await Bun.write(".rungs-state.json", "invalid json");
  
  const state = await stackManager.loadState();
  expect(state.branches).toEqual([]);
  expect(state.pullRequests).toEqual([]);
});

test("should throw error when not on default branch", async () => {
  mockGit.setMockStatus({ currentBranch: "feature-branch" });

  await expect(stackManager.pushStack()).rejects.toThrow(
    "Must be on main branch to push stack"
  );
});

test("should throw error when working directory is dirty", async () => {
  mockGit.setMockStatus({ isClean: false });

  await expect(stackManager.pushStack()).rejects.toThrow(
    "Working directory is not clean"
  );
});

test("should handle no new commits gracefully", async () => {
  mockGit.setMockCommits([]);
  
  // This should not throw and should log "No new commits"
  await stackManager.pushStack();
});

test("should create stack with new commits", async () => {
  const mockCommits = [
    { hash: "abc123", message: "Add feature", author: "test", date: "2023-01-01" },
    { hash: "def456", message: "Fix bug", author: "test", date: "2023-01-02" }
  ];
  
  mockGit.setMockCommits(mockCommits);

  // Mock the push operation to not throw
  await stackManager.pushStack();

  // Check that state was updated
  const state = await stackManager.loadState();
  expect(state.branches).toContain("test/test-branch");
  expect(state.pullRequests).toContain(123);
  expect(state.lastProcessedCommit).toBe("abc123");
});

test("should generate correct status message", async () => {
  // Set up some mock state
  const testState = {
    lastProcessedCommit: "abc123",
    branches: ["test/branch1"],
    pullRequests: [123]
  };
  await stackManager.saveState(testState);

  const mockCommits = [
    { hash: "def456", message: "New commit", author: "test", date: "2023-01-01" }
  ];
  mockGit.setMockCommits(mockCommits);

  const status = await stackManager.getStatus();

  expect(status).toContain("Branch: main");
  expect(status).toContain("Clean: Yes");
  expect(status).toContain("Active branches: 1");
  expect(status).toContain("Active PRs: 1");
  expect(status).toContain("New commits ready: 1");
  expect(status).toContain("test/branch1");
  expect(status).toContain("#123");
  expect(status).toContain("New commit");
});
