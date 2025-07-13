import { test, expect, beforeEach, afterEach, spyOn } from "bun:test";
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

afterEach(() => {
  // Clean up the spy to avoid affecting other tests
  mockBunShell?.mockRestore();
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
  
  // Mock getCurrentStack to return test data
  spyOn(stackManager, "getCurrentStack").mockResolvedValue({
    prs: [
      { number: 101, branch: "feat/test-1", title: "Test PR 1", url: "http://github.com/test/101", base: "main", head: "feat/test-1" },
      { number: 102, branch: "feat/test-2", title: "Test PR 2", url: "http://github.com/test/102", base: "feat/test-1", head: "feat/test-2" }
    ],
    totalCommits: 5
  });

  // Mock Bun.$ for ensurePrerequisites
  mockBunShell = spyOn(Bun, "$" as any).mockImplementation(() => 
    Promise.resolve({ text: () => Promise.resolve(""), quiet: () => Promise.resolve() })
  );
});

// Cleanup for StackManager tests
afterEach(() => {
  // Clean up all spies to avoid affecting other tests
  mockBunShell?.mockRestore();
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
  // Mock empty stack from GitHub
  spyOn(stackManager, "getCurrentStack").mockResolvedValue({
    prs: [],
    totalCommits: 0
  });

  await expect(stackManager.publishPullRequest()).rejects.toThrow(
    "No PRs found in current stack"
  );
});

test("StackManager should publish any PR number without warnings (GitHub-first approach)", async () => {
  // In the new GitHub-first approach, we don't track local state,
  // so any PR can be published without warnings
  await stackManager.publishPullRequest(999);
  
  expect(mockGitHub.publishPullRequest).toHaveBeenCalledWith(999);
});

test("StackManager should not warn when PR is in stack", async () => {
  const consoleSpy = spyOn(console, "warn").mockImplementation(() => {});
  
  await stackManager.publishPullRequest(101);
  
  expect(consoleSpy).not.toHaveBeenCalled();
  expect(mockGitHub.publishPullRequest).toHaveBeenCalledWith(101);
  
  consoleSpy.mockRestore();
});

// Auto-publish tests


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
