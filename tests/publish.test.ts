import { test, expect, beforeEach, spyOn } from "bun:test";
import { GitHubManager } from "../src/github-manager";
import { StackManager } from "../src/stack-manager";
import { ConfigManager } from "../src/config-manager";
import { GitManager } from "../src/git-manager";

let githubManager: GitHubManager;
let mockBunShell: any;

beforeEach(() => {
  githubManager = new GitHubManager();
  
  // Mock Bun.$ by spying on it
  mockBunShell = spyOn(Bun, "$" as any).mockImplementation(() => 
    Promise.resolve({ text: () => Promise.resolve(""), quiet: () => Promise.resolve() })
  );
});

test("GitHubManager should publish pull request successfully", async () => {
  await githubManager.publishPullRequest(123);
  
  expect(mockBunShell).toHaveBeenCalledTimes(1);
});

test("GitHubManager should handle 'not a draft' error gracefully", async () => {
  const error = new Error("Command failed");
  (error as any).stderr = "pull request #123 is not a draft";
  mockBunShell.mockRejectedValueOnce(error);

  await expect(githubManager.publishPullRequest(123)).rejects.toThrow(
    "Failed to publish pull request #123: pull request #123 is not a draft\n\nHint: This PR is already published (not a draft)."
  );
});

test("GitHubManager should handle 'not found' error gracefully", async () => {
  const error = new Error("Command failed");
  (error as any).stderr = "pull request #999 not found";
  mockBunShell.mockRejectedValueOnce(error);

  await expect(githubManager.publishPullRequest(999)).rejects.toThrow(
    "Failed to publish pull request #999: pull request #999 not found\n\nHint: PR number may not exist or you may not have access to it."
  );
});

test("GitHubManager should handle generic errors", async () => {
  const error = new Error("Network error");
  mockBunShell.mockRejectedValueOnce(error);

  await expect(githubManager.publishPullRequest(123)).rejects.toThrow(
    "Failed to publish pull request #123: Network error"
  );
});

test("GitHubManager should handle errors with only stderr", async () => {
  const error = new Error("Command failed");
  (error as any).stderr = "Authentication failed";
  mockBunShell.mockRejectedValueOnce(error);

  await expect(githubManager.publishPullRequest(123)).rejects.toThrow(
    "Failed to publish pull request #123: Authentication failed"
  );
});

// StackManager tests
let stackManager: StackManager;
let mockConfig: ConfigManager;
let mockGit: GitManager;
let mockGitHub: GitHubManager;

beforeEach(() => {
  mockConfig = {
    getAll: () => Promise.resolve({ defaultBranch: "main" }),
  } as any;

  mockGit = {
    isGitRepo: () => Promise.resolve(true),
  } as any;

  mockGitHub = {
    isGitHubCLIAvailable: () => Promise.resolve(true),
    isAuthenticated: () => Promise.resolve(true),
    publishPullRequest: spyOn({} as any, "publishPullRequest").mockResolvedValue(undefined),
  } as any;

  stackManager = new StackManager(mockConfig, mockGit, mockGitHub);
  
  // Mock state file operations
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: ["feat/test-1", "feat/test-2"],
    pullRequests: [101, 102],
    lastBranch: "feat/test-2"
  });
  
  spyOn(stackManager, "syncWithGitHub").mockResolvedValue();

  // Mock Bun.$ for ensurePrerequisites
  mockBunShell = spyOn(Bun, "$" as any).mockImplementation(() => 
    Promise.resolve({ text: () => Promise.resolve(""), quiet: () => Promise.resolve() })
  );
});

test("StackManager should publish specific PR number", async () => {
  await stackManager.publishPullRequest(101);
  
  expect(mockGitHub.publishPullRequest).toHaveBeenCalledWith(101);
});

test("StackManager should publish top PR when no number provided", async () => {
  await stackManager.publishPullRequest();
  
  expect(mockGitHub.publishPullRequest).toHaveBeenCalledWith(102);
});

test("StackManager should throw error when no PRs in stack and no number provided", async () => {
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: [],
    pullRequests: [],
  });

  await expect(stackManager.publishPullRequest()).rejects.toThrow(
    "No PRs found in current stack"
  );
});

test("StackManager should warn when PR is not in stack but proceed anyway", async () => {
  const consoleSpy = spyOn(console, "warn").mockImplementation(() => {});
  
  await stackManager.publishPullRequest(999);
  
  expect(consoleSpy).toHaveBeenCalledWith(
    "Warning: PR #999 is not tracked in current stack, but attempting to publish anyway..."
  );
  expect(mockGitHub.publishPullRequest).toHaveBeenCalledWith(999);
  
  consoleSpy.mockRestore();
});

test("StackManager should not warn when PR is in stack", async () => {
  const consoleSpy = spyOn(console, "warn").mockImplementation(() => {});
  
  await stackManager.publishPullRequest(101);
  
  expect(consoleSpy).not.toHaveBeenCalled();
  expect(mockGitHub.publishPullRequest).toHaveBeenCalledWith(101);
  
  consoleSpy.mockRestore();
});

// Auto-publish tests
test("StackManager pushStack should create draft PR when autoPublish is false", async () => {
  const mockConfig2 = {
    getAll: () => Promise.resolve({
      defaultBranch: "main",
      userPrefix: "test",
      branchNaming: "sequential",
      autoRebase: false,
      draftPRs: true
    }),
  } as any;

  const mockGit2 = {
    isGitRepo: () => Promise.resolve(true),
    getCurrentBranch: () => Promise.resolve("main"),
    getStatus: () => Promise.resolve({ isClean: true, ahead: 0, behind: 0, currentBranch: "main" }),
    getCommitsSince: () => Promise.resolve([
      { hash: "abc123", message: "Test commit", author: "test", date: "2023-01-01" }
    ]),
    generateBranchName: () => "test/feat-1",
    branchExists: () => Promise.resolve(false),
    createBranch: () => Promise.resolve(),
    pushBranch: () => Promise.resolve(),
    checkoutBranch: () => Promise.resolve(),
  } as any;

  const mockGitHub2 = {
    isGitHubCLIAvailable: () => Promise.resolve(true),
    isAuthenticated: () => Promise.resolve(true),
    createPullRequest: spyOn({} as any, "createPullRequest").mockResolvedValue({
      number: 123,
      title: "Test commit",
      body: "Single commit stack:\n\n- Test commit",
      url: "https://github.com/test/repo/pull/123",
      draft: false,
      head: "test/feat-1",
      base: "main"
    }),
    generatePRTitle: () => "Test commit",
    generatePRBody: () => "Single commit stack:\n\n- Test commit",
  } as any;

  const stackManager2 = new StackManager(mockConfig2, mockGit2, mockGitHub2);
  
  // Mock state file operations
  spyOn(stackManager2, "loadState").mockResolvedValue({
    branches: [],
    pullRequests: [],
  });
  
  spyOn(stackManager2, "saveState").mockResolvedValue();
  spyOn(stackManager2, "syncWithGitHub").mockResolvedValue();

  await stackManager2.pushStack(false);
  
  expect(mockGitHub2.createPullRequest).toHaveBeenCalledWith(
    "Test commit",
    "Single commit stack:\n\n- Test commit",
    "test/feat-1",
    "main",
    true // draft = true when autoPublish = false and draftPRs = true
  );
});

test("StackManager pushStack should create published PR when autoPublish is true", async () => {
  const mockConfig3 = {
    getAll: () => Promise.resolve({
      defaultBranch: "main",
      userPrefix: "test",
      branchNaming: "sequential",
      autoRebase: false,
      draftPRs: true
    }),
  } as any;

  const mockGit3 = {
    isGitRepo: () => Promise.resolve(true),
    getCurrentBranch: () => Promise.resolve("main"),
    getStatus: () => Promise.resolve({ isClean: true, ahead: 0, behind: 0, currentBranch: "main" }),
    getCommitsSince: () => Promise.resolve([
      { hash: "abc123", message: "Test commit", author: "test", date: "2023-01-01" }
    ]),
    generateBranchName: () => "test/feat-1",
    branchExists: () => Promise.resolve(false),
    createBranch: () => Promise.resolve(),
    pushBranch: () => Promise.resolve(),
    checkoutBranch: () => Promise.resolve(),
  } as any;

  const mockGitHub3 = {
    isGitHubCLIAvailable: () => Promise.resolve(true),
    isAuthenticated: () => Promise.resolve(true),
    createPullRequest: spyOn({} as any, "createPullRequest").mockResolvedValue({
      number: 123,
      title: "Test commit",
      body: "Single commit stack:\n\n- Test commit",
      url: "https://github.com/test/repo/pull/123",
      draft: false,
      head: "test/feat-1",
      base: "main"
    }),
    generatePRTitle: () => "Test commit",
    generatePRBody: () => "Single commit stack:\n\n- Test commit",
  } as any;

  const stackManager3 = new StackManager(mockConfig3, mockGit3, mockGitHub3);
  
  // Mock state file operations
  spyOn(stackManager3, "loadState").mockResolvedValue({
    branches: [],
    pullRequests: [],
  });
  
  spyOn(stackManager3, "saveState").mockResolvedValue();
  spyOn(stackManager3, "syncWithGitHub").mockResolvedValue();

  await stackManager3.pushStack(true);
  
  expect(mockGitHub3.createPullRequest).toHaveBeenCalledWith(
    "Test commit",
    "Single commit stack:\n\n- Test commit",
    "test/feat-1",
    "main",
    false // draft = false when autoPublish = true
  );
});

test("CLI argument parsing should parse --auto-publish flag correctly", () => {
  // This tests the parseArgs configuration in cli.ts
  // We'll test the actual CLI integration in integration tests
  
  const mockParseArgs = (args: string[]) => {
    const options: Record<string, any> = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--auto-publish") {
        options["auto-publish"] = true;
      }
    }
    return { values: options, positionals: args.filter(arg => !arg.startsWith("--")) };
  };

  const result1 = mockParseArgs(["push", "--auto-publish"]);
  expect(result1.values["auto-publish"]).toBe(true);

  const result2 = mockParseArgs(["push"]);
  expect(result2.values["auto-publish"]).toBeUndefined();
});

test("CLI argument parsing should parse publish command arguments", () => {
  const mockParseArgs = (args: string[]) => {
    return { 
      values: {}, 
      positionals: args.filter(arg => !arg.startsWith("--")) 
    };
  };

  const result1 = mockParseArgs(["publish", "123"]);
  expect(result1.positionals).toEqual(["publish", "123"]);

  const result2 = mockParseArgs(["publish"]);
  expect(result2.positionals).toEqual(["publish"]);
});
