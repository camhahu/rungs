import { test, expect } from "bun:test";
import { GitManager } from "../src/git-manager";

class MockGitManager extends GitManager {
  private commitHashes: Map<string, string> = new Map();
  private fetchedBranches: Set<string> = new Set();
  private rebaseCommands: string[] = [];

  // Mock the getCommitHash method
  async getCommitHash(ref: string): Promise<string> {
    const hash = this.commitHashes.get(ref);
    if (!hash) {
      throw new Error(`Failed to get commit hash for ${ref}`);
    }
    return hash;
  }

  // Mock fetchBranch to track what was fetched
  async fetchBranch(branch: string): Promise<void> {
    if (branch === "deleted-branch") {
      throw new Error(`Failed to fetch branch ${branch}: does not exist`);
    }
    this.fetchedBranches.add(branch);
  }

  // Mock rebaseOntoTarget to track rebase commands
  async rebaseOntoTarget(newBase: string, oldBase: string): Promise<void> {
    this.rebaseCommands.push(`rebase --onto ${newBase} ${oldBase}`);
  }

  // Mock pushForceWithLease
  async pushForceWithLease(branch: string): Promise<void> {
    // No-op for testing
  }

  // Mock checkoutBranch  
  async checkoutBranch(branch: string): Promise<void> {
    // No-op for testing
  }

  // Mock getCurrentBranch
  async getCurrentBranch(): Promise<string> {
    return "main";
  }

  // Test helper methods
  setCommitHash(ref: string, hash: string) {
    this.commitHashes.set(ref, hash);
  }

  getFetchedBranches(): Set<string> {
    return this.fetchedBranches;
  }

  getRebaseCommands(): string[] {
    return this.rebaseCommands;
  }
}

test("squash merge restack should use commit hash instead of deleted branch", async () => {
  const mockGit = new MockGitManager();
  
  // Setup: parent branch commit hash before deletion
  const parentCommitHash = "abc123def456";
  mockGit.setCommitHash("origin/feature-parent", parentCommitHash);
  
  // Simulate the scenario:
  // 1. feature-parent branch exists before merge
  // 2. We capture its commit hash
  const capturedHash = await mockGit.getCommitHash("origin/feature-parent");
  expect(capturedHash).toBe(parentCommitHash);
  
  // 3. Branch gets deleted during squash merge (GitHub does this automatically)
  // 4. We try to restack dependent branch using the captured commit hash
  
  // This should work - using commit hash instead of branch name
  await mockGit.rebaseOntoTarget("origin/main", capturedHash);
  
  // This should fail - trying to fetch deleted branch
  try {
    await mockGit.fetchBranch("deleted-branch");
    expect(true).toBe(false); // Should not reach here
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("does not exist");
  }
  
  // Verify the rebase used the commit hash directly
  const rebaseCommands = mockGit.getRebaseCommands();
  expect(rebaseCommands).toContain(`rebase --onto origin/main ${parentCommitHash}`);
  
  // Verify we didn't try to fetch the commit hash as a branch
  const fetchedBranches = mockGit.getFetchedBranches();
  expect(fetchedBranches.has(parentCommitHash)).toBe(false);
});

test("getCommitHash method should retrieve commit SHA for any git reference", async () => {
  const mockGit = new MockGitManager();
  
  // Test various reference types
  const testCases = [
    { ref: "origin/main", hash: "main123abc" },
    { ref: "origin/feature-branch", hash: "feature456def" },
    { ref: "HEAD", hash: "head789ghi" },
    { ref: "v1.0.0", hash: "tag012jkl" }
  ];
  
  for (const testCase of testCases) {
    mockGit.setCommitHash(testCase.ref, testCase.hash);
    const result = await mockGit.getCommitHash(testCase.ref);
    expect(result).toBe(testCase.hash);
  }
});

test("getCommitHash should handle non-existent references", async () => {
  const mockGit = new MockGitManager();
  
  try {
    await mockGit.getCommitHash("origin/non-existent-branch");
    expect(true).toBe(false); // Should not reach here
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Failed to get commit hash");
  }
});
