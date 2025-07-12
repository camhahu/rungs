import { test, expect } from "bun:test";
import { StackManager } from "../src/stack-manager.js";
import { ConfigManager } from "../src/config-manager.js";
import { GitManager } from "../src/git-manager.js";
import { GitHubManager } from "../src/github-manager.js";

// Mock implementations
class MockConfigManager extends ConfigManager {
  async getAll() {
    return {
      draftPRs: true, // Default to draft PRs
      defaultBranch: "main",
      userPrefix: "test",
      branchNaming: "hash",
      autoRebase: false
    };
  }
}

class MockGitManager extends GitManager {
  async isGitRepo(): Promise<boolean> { return true; }
  async getCurrentBranch(): Promise<string> { return "main"; }
  async getStatus() { return { isClean: true, ahead: 0, behind: 0 }; }
  async getCommitsSince(): Promise<any[]> {
    return [{
      hash: "abc123",
      message: "Test commit",
      date: new Date().toISOString()
    }];
  }
  async fetchOrigin(): Promise<void> {}
  async createBranch(): Promise<void> {}
  async pushBranch(): Promise<void> {}
  async checkoutBranch(): Promise<void> {}
  async branchExists(): Promise<boolean> { return false; }
  generateBranchName(): string { return "test-branch"; }
}

class MockGitHubManager extends GitHubManager {
  private lastDraftValue?: boolean;

  async isGitHubCLIAvailable(): Promise<boolean> { return true; }
  async isAuthenticated(): Promise<boolean> { return true; }
  async findPRsWithCommits(): Promise<any[]> { return []; }
  
  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string,
    draft: boolean = true
  ) {
    this.lastDraftValue = draft;
    return {
      number: 123,
      title,
      body,
      url: "https://github.com/test/repo/pull/123",
      draft,
      head,
      base
    };
  }

  generatePRTitle(): string { return "Test PR"; }
  generatePRBody(): string { return "Test body"; }

  getLastDraftValue(): boolean | undefined {
    return this.lastDraftValue;
  }
}

test("auto-publish creates PR as ready for review", async () => {
  const config = new MockConfigManager();
  const git = new MockGitManager();
  const github = new MockGitHubManager();
  const stack = new StackManager(config as any, git as any, github as any);

  // Mock the GitHub stack discovery
  (stack as any).getCurrentStack = async () => ({
    prs: [],
    totalCommits: 0
  });
  (stack as any).validateSyncStatus = async () => {};

  // Test with auto-publish enabled
  await stack.pushStack(true, false); // autoPublish = true

  // Verify PR was created as non-draft
  expect(github.getLastDraftValue()).toBe(false);
});

test("default behavior creates draft PR when draftPRs is true", async () => {
  const config = new MockConfigManager();
  const git = new MockGitManager();
  const github = new MockGitHubManager();
  const stack = new StackManager(config as any, git as any, github as any);

  // Mock the GitHub stack discovery
  (stack as any).getCurrentStack = async () => ({
    prs: [],
    totalCommits: 0
  });
  (stack as any).validateSyncStatus = async () => {};

  // Test without auto-publish (should respect config.draftPRs = true)
  await stack.pushStack(false, false); // autoPublish = false

  // Verify PR was created as draft
  expect(github.getLastDraftValue()).toBe(true);
});
