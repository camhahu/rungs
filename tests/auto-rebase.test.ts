import { test, expect, beforeEach, afterEach } from "bun:test";
import { StackManager } from "../src/stack-manager";
import { ConfigManager } from "../src/config-manager";
import { GitManager } from "../src/git-manager";
import { GitHubManager } from "../src/github-manager";
import { join } from "path";
import { tmpdir } from "os";
import { mkdirSync, rmSync, existsSync } from "fs";

// Mock implementations specifically for auto-rebase testing
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
  async isGitRepo() { return true; }
  async getCurrentBranch() { return "main"; }
  async getStatus() { return { currentBranch: "main", isClean: true, ahead: 0, behind: 0 }; }
  async getCommitsSince(base: string) { return []; }
  async fetchOrigin() { }
  async rebaseOnto(branch: string) { }
  async createBranch(name: string) { }
  async checkoutBranch(name: string) { }
  async branchExists(name: string) { return false; }
  async pushBranch(name: string) { }
  
  generateBranchName(commits: any[], prefix: string, strategy: string) {
    return `${prefix}/test-branch`;
  }
}

class MockGitHubManager {
  async isGitHubCLIAvailable() { return true; }
  async isAuthenticated() { return true; }
  
  // These will be overridden in tests
  async getPullRequestStatus(prNumber: number): Promise<"open" | "merged" | "closed" | null> {
    return "open";
  }

  async getPullRequestByNumber(prNumber: number) {
    return {
      number: prNumber,
      title: "Test PR",
      body: "Test body",
      url: `https://github.com/test/test/pull/${prNumber}`,
      draft: false,
      head: `branch${prNumber}`,
      base: "main"
    };
  }

  async updatePullRequestBase(prNumber: number, newBase: string): Promise<void> {
    // Mock implementation - overridden in tests
  }

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
  tempDir = join(tmpdir(), `rungs-auto-rebase-test-${Date.now()}`);
  
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
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
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
});

// ============= AUTO-REBASE FUNCTIONALITY TESTS =============

test("REGRESSION: autoRebaseAfterMerges should update PR bases correctly after merges", async () => {
  const updateCallArgs: Array<{prNumber: number, newBase: string}> = [];
  
  mockGitHub.getPullRequestStatus = async (prNumber: number) => {
    if (prNumber === 1) return "merged";
    if (prNumber === 2) return "open";
    if (prNumber === 3) return "open";
    return "closed";
  };
  
  mockGitHub.getPullRequestByNumber = async (prNumber: number) => ({
    number: prNumber,
    title: "Test PR",
    body: "Test body",
    url: `https://github.com/test/test/pull/${prNumber}`,
    draft: false,
    head: `branch${prNumber}`,
    base: prNumber === 1 ? "main" : `branch${prNumber - 1}`
  });

  mockGitHub.updatePullRequestBase = async (prNumber: number, newBase: string) => {
    updateCallArgs.push({ prNumber, newBase });
  };

  // Set up state with 3 PRs where first is merged
  const testState = {
    branches: ["branch1", "branch2", "branch3"],
    pullRequests: [1, 2, 3],
    lastBranch: "branch3"
  };
  await stackManager.saveState(testState);

  await stackManager.syncWithGitHub();

  // Verify that remaining PRs got rebased correctly
  expect(updateCallArgs).toEqual([
    { prNumber: 2, newBase: "main" },      // First remaining PR should point to main
    { prNumber: 3, newBase: "branch2" }    // Second remaining PR should point to first remaining
  ]);

  // Verify state was updated
  const newState = await stackManager.loadState();
  expect(newState.pullRequests).toEqual([2, 3]);
  expect(newState.branches).toEqual(["branch2", "branch3"]);
});

test("REGRESSION: should detect PRs with incorrect bases and fix them", async () => {
  const updateCallArgs: Array<{prNumber: number, newBase: string}> = [];
  
  mockGitHub.getPullRequestStatus = async (prNumber: number) => "open";
  
  mockGitHub.getPullRequestByNumber = async (prNumber: number) => ({
    number: prNumber,
    title: "Test PR",
    body: "Test body",
    url: `https://github.com/test/test/pull/${prNumber}`,
    draft: false,
    head: `branch${prNumber}`,
    base: "deleted-branch" // Wrong base - should be main for first PR
  });

  mockGitHub.updatePullRequestBase = async (prNumber: number, newBase: string) => {
    updateCallArgs.push({ prNumber, newBase });
  };

  // Mock branchExistsOnGitHub to return false for deleted branch
  (stackManager as any).branchExistsOnGitHub = async (branchName: string) => {
    return branchName !== "deleted-branch";
  };

  // Set up state with PR that has incorrect base
  const testState = {
    branches: ["branch1"],
    pullRequests: [1],
    lastBranch: "branch1"
  };
  await stackManager.saveState(testState);

  await stackManager.syncWithGitHub();

  // Verify that incorrect base was detected and fixed
  expect(updateCallArgs).toEqual([
    { prNumber: 1, newBase: "main" }
  ]);
});

test("REGRESSION: should handle deleted/merged branches correctly", async () => {
  let branchExistsCallCount = 0;
  const checkedBranches: string[] = [];
  
  mockGitHub.getPullRequestStatus = async (prNumber: number) => "open";
  
  mockGitHub.getPullRequestByNumber = async (prNumber: number) => ({
    number: prNumber,
    title: "Test PR", 
    body: "Test body",
    url: `https://github.com/test/test/pull/${prNumber}`,
    draft: false,
    head: `branch${prNumber}`,
    base: "merged-branch" // This branch was merged and deleted
  });

  mockGitHub.updatePullRequestBase = async (prNumber: number, newBase: string) => {
    expect(newBase).toBe("main");
  };

  // Mock branchExistsOnGitHub to track calls and return false for merged branch
  (stackManager as any).branchExistsOnGitHub = async (branchName: string) => {
    branchExistsCallCount++;
    checkedBranches.push(branchName);
    return branchName !== "merged-branch";
  };

  const testState = {
    branches: ["branch1"],
    pullRequests: [1],
    lastBranch: "branch1"
  };
  await stackManager.saveState(testState);

  await stackManager.syncWithGitHub();

  expect(branchExistsCallCount).toBeGreaterThan(0);
  expect(checkedBranches).toContain("merged-branch");
});

test("should handle multiple PRs with mixed states", async () => {
  const updateCallArgs: Array<{prNumber: number, newBase: string}> = [];
  
  mockGitHub.getPullRequestStatus = async (prNumber: number) => {
    if (prNumber === 1) return "merged";
    if (prNumber === 2) return "closed"; // Closed without merge
    if (prNumber === 3) return "open";
    if (prNumber === 4) return "open";
    return "closed";
  };
  
  mockGitHub.getPullRequestByNumber = async (prNumber: number) => ({
    number: prNumber,
    title: "Test PR",
    body: "Test body", 
    url: `https://github.com/test/test/pull/${prNumber}`,
    draft: false,
    head: `branch${prNumber}`,
    // After merge/close, the remaining PRs should have correct bases
    base: prNumber === 3 ? "main" : prNumber === 4 ? "branch3" : "main"
  });

  mockGitHub.updatePullRequestBase = async (prNumber: number, newBase: string) => {
    updateCallArgs.push({ prNumber, newBase });
  };

  // Mock branchExistsOnGitHub to return true for all remaining branches
  (stackManager as any).branchExistsOnGitHub = async (branchName: string) => {
    return true; // All branches exist
  };

  // Set up state with mixed PR states
  const testState = {
    branches: ["branch1", "branch2", "branch3", "branch4"],
    pullRequests: [1, 2, 3, 4],
    lastBranch: "branch4"
  };
  await stackManager.saveState(testState);

  await stackManager.syncWithGitHub();

  // After sync: PR 1 merged, PR 2 closed, only PR 3 and 4 should remain
  const newState = await stackManager.loadState();
  expect(newState.pullRequests).toEqual([3, 4]);
  expect(newState.branches).toEqual(["branch3", "branch4"]);
  
  // Auto-rebase runs first: PR 3 -> main, PR 4 -> branch3
  // Then fix-incorrect-bases runs: PR 3 has expected base "branch2" (index 2 in original array)
  expect(updateCallArgs).toEqual([
    { prNumber: 3, newBase: "main" },     // Auto-rebase: first remaining PR to main
    { prNumber: 4, newBase: "branch3" },  // Auto-rebase: second remaining PR to first remaining branch
    { prNumber: 3, newBase: "branch2" }   // Fix-incorrect: PR 3 expected base "branch2" (original index logic)
  ]);
});

test("should handle GitHub API errors gracefully", async () => {
  let errorCount = 0;
  
  mockGitHub.getPullRequestStatus = async (prNumber: number) => {
    if (prNumber === 1) {
      errorCount++;
      throw new Error("GitHub API error");
    }
    return "open";
  };
  
  mockGitHub.getPullRequestByNumber = async (prNumber: number) => ({
    number: prNumber,
    title: "Test PR",
    body: "Test body",
    url: `https://github.com/test/test/pull/${prNumber}`,
    draft: false,
    head: `branch${prNumber}`,
    base: "main"
  });

  const testState = {
    branches: ["branch1", "branch2"],
    pullRequests: [1, 2],
    lastBranch: "branch2"
  };
  await stackManager.saveState(testState);

  // Should not throw, should handle errors gracefully
  await stackManager.syncWithGitHub();

  expect(errorCount).toBe(1);
  
  // State should be updated to remove errored PR and keep working one
  const newState = await stackManager.loadState();
  expect(newState.pullRequests).toEqual([2]);
  expect(newState.branches).toEqual(["branch2"]);
});

test("should handle empty state gracefully", async () => {
  // Empty state should not cause any errors
  const emptyState = {
    branches: [],
    pullRequests: []
  };
  await stackManager.saveState(emptyState);

  // Should complete without errors
  await stackManager.syncWithGitHub();
  
  const state = await stackManager.loadState();
  expect(state.pullRequests).toEqual([]);
  expect(state.branches).toEqual([]);
});

test("should not call updatePullRequestBase for PRs with correct bases", async () => {
  let updateCallCount = 0;
  
  mockGitHub.getPullRequestStatus = async (prNumber: number) => "open";
  
  mockGitHub.getPullRequestByNumber = async (prNumber: number) => ({
    number: prNumber,
    title: "Test PR",
    body: "Test body",
    url: `https://github.com/test/test/pull/${prNumber}`,
    draft: false,
    head: `branch${prNumber}`,
    base: prNumber === 1 ? "main" : `branch${prNumber - 1}` // Correct bases
  });

  mockGitHub.updatePullRequestBase = async (prNumber: number, newBase: string) => {
    updateCallCount++;
  };

  const testState = {
    branches: ["branch1", "branch2"],
    pullRequests: [1, 2],
    lastBranch: "branch2"
  };
  await stackManager.saveState(testState);

  await stackManager.syncWithGitHub();

  // No updates should be needed since bases are already correct
  expect(updateCallCount).toBe(0);
});

test("REGRESSION: infinite recursion prevention - syncWithGitHub should not call ensurePrerequisites", async () => {
  let syncCallCount = 0;
  
  // Track direct calls to syncWithGitHub
  const originalSync = stackManager.syncWithGitHub.bind(stackManager);
  stackManager.syncWithGitHub = async () => {
    syncCallCount++;
    if (syncCallCount > 1) {
      throw new Error("Infinite recursion detected: syncWithGitHub called multiple times");
    }
    return originalSync();
  };

  mockGitHub.getPullRequestStatus = async (prNumber: number) => {
    if (prNumber === 1) return "merged";
    return "open";
  };
  
  mockGitHub.getPullRequestByNumber = async (prNumber: number) => ({
    number: prNumber,
    title: "Test PR",
    body: "Test body",
    url: `https://github.com/test/test/pull/${prNumber}`,
    draft: false,
    head: `branch${prNumber}`,
    base: "main"
  });

  const testState = {
    branches: ["branch1", "branch2"],
    pullRequests: [1, 2],
    lastBranch: "branch2"
  };
  await stackManager.saveState(testState);

  // This should only call syncWithGitHub once
  await stackManager.syncWithGitHub();
  
  expect(syncCallCount).toBe(1);
});

test("autoRebaseAfterMerges method should work independently", async () => {
  const updateCallArgs: Array<{prNumber: number, newBase: string}> = [];
  
  mockGitHub.updatePullRequestBase = async (prNumber: number, newBase: string) => {
    updateCallArgs.push({ prNumber, newBase });
  };

  // Test autoRebaseAfterMerges directly
  const activePRs = [2, 3, 4];
  const activeBranches = ["branch2", "branch3", "branch4"];
  
  await (stackManager as any).autoRebaseAfterMerges(activePRs, activeBranches);

  // Verify correct rebase operations
  expect(updateCallArgs).toEqual([
    { prNumber: 2, newBase: "main" },      // First PR should point to main
    { prNumber: 3, newBase: "branch2" },   // Second PR should point to first branch
    { prNumber: 4, newBase: "branch3" }    // Third PR should point to second branch
  ]);
});

test("fixIncorrectBases method should work independently", async () => {
  const updateCallArgs: Array<{prNumber: number, newBase: string}> = [];
  
  mockGitHub.updatePullRequestBase = async (prNumber: number, newBase: string) => {
    updateCallArgs.push({ prNumber, newBase });
  };

  // Test fixIncorrectBases directly
  const needsRebase = [
    { prNumber: 1, branchName: "branch1", correctBase: "main" },
    { prNumber: 2, branchName: "branch2", correctBase: "branch1" }
  ];
  
  await (stackManager as any).fixIncorrectBases(needsRebase);

  // Verify correct base updates
  expect(updateCallArgs).toEqual([
    { prNumber: 1, newBase: "main" },
    { prNumber: 2, newBase: "branch1" }
  ]);
});
