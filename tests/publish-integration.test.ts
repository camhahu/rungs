import { test, expect, beforeEach, spyOn } from "bun:test";
import { StackManager } from "../src/stack-manager";
import { GitHubManager } from "../src/github-manager";
import { ConfigManager } from "../src/config-manager";
import { GitManager } from "../src/git-manager";

let stackManager: StackManager;
let githubManager: GitHubManager;
let configManager: ConfigManager;
let gitManager: GitManager;
let mockBunShell: any;

beforeEach(() => {
  // Setup managers with real implementations but mocked dependencies
  configManager = new ConfigManager();
  gitManager = new GitManager();
  githubManager = new GitHubManager();
  stackManager = new StackManager(configManager, gitManager, githubManager);

  // Mock config responses
  spyOn(configManager, "getAll").mockResolvedValue({
    defaultBranch: "main",
    userPrefix: "test",
    branchNaming: "sequential",
    autoRebase: false,
    draftPRs: true
  });

  // Mock git operations
  spyOn(gitManager, "isGitRepo").mockResolvedValue(true);
  spyOn(gitManager, "getCurrentBranch").mockResolvedValue("main");
  spyOn(gitManager, "getStatus").mockResolvedValue({
    isClean: true,
    ahead: 0,
    behind: 0,
    currentBranch: "main"
  });

  // Mock GitHub CLI availability
  spyOn(githubManager, "isGitHubCLIAvailable").mockResolvedValue(true);
  spyOn(githubManager, "isAuthenticated").mockResolvedValue(true);

  // Mock state operations
  spyOn(stackManager, "syncWithGitHub").mockResolvedValue();

  // Mock Bun.$
  mockBunShell = spyOn(Bun, "$" as any).mockImplementation(() => 
    Promise.resolve({ text: () => Promise.resolve(""), quiet: () => Promise.resolve() })
  );
});

test("complete publish workflow - publish specific PR", async () => {
  // Mock existing stack state
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: ["test/feat-1", "test/feat-2"],
    pullRequests: [100, 101],
    lastBranch: "test/feat-2"
  });

  await stackManager.publishPullRequest(100);

  expect(mockBunShell).toHaveBeenCalledTimes(1);
});

test("complete publish workflow - publish top PR", async () => {
  // Mock existing stack state
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: ["test/feat-1", "test/feat-2"],
    pullRequests: [100, 101],
    lastBranch: "test/feat-2"
  });

  await stackManager.publishPullRequest();

  expect(mockBunShell).toHaveBeenCalledTimes(1);
});

test("auto-publish workflow with push command", async () => {
  // Mock git operations for push
  spyOn(gitManager, "getCommitsSince").mockResolvedValue([
    { hash: "abc123", message: "Add new feature", author: "test", date: "2023-01-01" }
  ]);
  spyOn(gitManager, "generateBranchName").mockReturnValue("test/add-new-feature");
  spyOn(gitManager, "branchExists").mockResolvedValue(false);
  spyOn(gitManager, "createBranch").mockResolvedValue();
  spyOn(gitManager, "pushBranch").mockResolvedValue();
  spyOn(gitManager, "checkoutBranch").mockResolvedValue();

  // Mock GitHub operations
  spyOn(githubManager, "generatePRTitle").mockReturnValue("Add new feature");
  spyOn(githubManager, "generatePRBody").mockReturnValue("Single commit stack:\n\n- Add new feature");
  spyOn(githubManager, "createPullRequest").mockResolvedValue({
    number: 102,
    title: "Add new feature",
    body: "Single commit stack:\n\n- Add new feature",
    url: "https://github.com/test/repo/pull/102",
    draft: false,
    head: "test/add-new-feature",
    base: "main"
  });

  // Mock state operations
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: [],
    pullRequests: [],
  });
  spyOn(stackManager, "saveState").mockResolvedValue();

  // Test auto-publish = true
  await stackManager.pushStack(true);

  expect(githubManager.createPullRequest).toHaveBeenCalledWith(
    "Add new feature",
    "Single commit stack:\n\n- Add new feature",
    "test/add-new-feature",
    "main",
    false // draft = false for auto-publish
  );
});

test("error handling - PR not found", async () => {
  // Mock state with valid PRs
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: ["test/feat-1"],
    pullRequests: [100],
    lastBranch: "test/feat-1"
  });

  // Mock GitHub CLI error for non-existent PR
  const error = new Error("gh command failed");
  (error as any).stderr = "pull request #999 not found";
  mockBunShell.mockRejectedValueOnce(error);

  await expect(stackManager.publishPullRequest(999)).rejects.toThrow(
    "Failed to publish pull request #999: pull request #999 not found\n\nHint: PR number may not exist or you may not have access to it."
  );
});

test("error handling - PR already published", async () => {
  // Mock state with valid PRs
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: ["test/feat-1"],
    pullRequests: [100],
    lastBranch: "test/feat-1"
  });

  // Mock GitHub CLI error for already published PR
  const error = new Error("gh command failed");
  (error as any).stderr = "pull request #100 is not a draft";
  mockBunShell.mockRejectedValueOnce(error);

  await expect(stackManager.publishPullRequest(100)).rejects.toThrow(
    "Failed to publish pull request #100: pull request #100 is not a draft\n\nHint: This PR is already published (not a draft)."
  );
});

test("error handling - no PRs in stack", async () => {
  // Mock empty stack state
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: [],
    pullRequests: [],
  });

  await expect(stackManager.publishPullRequest()).rejects.toThrow(
    "No PRs found in current stack"
  );
});

test("interaction with merge command after publish", async () => {
  // Mock state with published PRs
  spyOn(stackManager, "loadState")
    .mockResolvedValueOnce({
      branches: ["test/feat-1", "test/feat-2"],
      pullRequests: [100, 101],
      lastBranch: "test/feat-2"
    })
    .mockResolvedValueOnce({
      branches: ["test/feat-1", "test/feat-2"],
      pullRequests: [100, 101],
      lastBranch: "test/feat-2"
    });

  // Mock GitHub merge operation
  spyOn(githubManager, "mergePullRequest").mockResolvedValue();

  // First publish the PR
  await stackManager.publishPullRequest(100);

  // Then merge it
  await stackManager.mergePullRequest(100);

  expect(mockBunShell).toHaveBeenCalledTimes(1); // Only the publish call
  expect(githubManager.mergePullRequest).toHaveBeenCalledWith(100, "squash", true);
});

test("state management across publish operations", async () => {
  let stateCallCount = 0;
  const stateSequence = [
    {
      branches: ["test/feat-1", "test/feat-2"],
      pullRequests: [100, 101],
      lastBranch: "test/feat-2"
    },
    {
      branches: ["test/feat-1", "test/feat-2"],
      pullRequests: [100, 101],
      lastBranch: "test/feat-2"
    }
  ];

  spyOn(stackManager, "loadState").mockImplementation(() => {
    return Promise.resolve(stateSequence[stateCallCount++] || stateSequence[stateSequence.length - 1]);
  });

  // Publish multiple PRs
  await stackManager.publishPullRequest(100);
  await stackManager.publishPullRequest(101);

  expect(mockBunShell).toHaveBeenCalledTimes(2);
});

test("publish with prerequisites check", async () => {
  // Mock prerequisites failure
  spyOn(gitManager, "isGitRepo").mockResolvedValue(false);

  await expect(stackManager.publishPullRequest(100)).rejects.toThrow(
    "Not in a git repository. Run 'git init' to initialize a repository."
  );
});

test("publish with GitHub CLI not available", async () => {
  // Mock GitHub CLI not available
  spyOn(githubManager, "isGitHubCLIAvailable").mockResolvedValue(false);

  await expect(stackManager.publishPullRequest(100)).rejects.toThrow(
    "GitHub CLI (gh) is not installed or not in PATH. Install from https://cli.github.com/"
  );
});

test("publish with GitHub not authenticated", async () => {
  // Mock GitHub not authenticated
  spyOn(githubManager, "isAuthenticated").mockResolvedValue(false);

  await expect(stackManager.publishPullRequest(100)).rejects.toThrow(
    "Not authenticated with GitHub CLI. Run 'gh auth login' to authenticate."
  );
});

test("push --auto-publish creates published PRs", async () => {
  // Mock config with draftPRs = true (should be overridden)
  spyOn(configManager, "getAll").mockResolvedValue({
    defaultBranch: "main",
    userPrefix: "test",
    branchNaming: "sequential",
    autoRebase: false,
    draftPRs: true // This should be overridden by autoPublish
  });

  // Mock new commits
  spyOn(gitManager, "getCommitsSince").mockResolvedValue([
    { hash: "abc123", message: "Add feature X", author: "test", date: "2023-01-01" }
  ]);

  // Mock git operations
  spyOn(gitManager, "generateBranchName").mockReturnValue("test/add-feature-x");
  spyOn(gitManager, "branchExists").mockResolvedValue(false);
  spyOn(gitManager, "createBranch").mockResolvedValue();
  spyOn(gitManager, "pushBranch").mockResolvedValue();
  spyOn(gitManager, "checkoutBranch").mockResolvedValue();

  // Mock GitHub operations
  spyOn(githubManager, "generatePRTitle").mockReturnValue("Add feature X");
  spyOn(githubManager, "generatePRBody").mockReturnValue("Single commit stack:\n\n- Add feature X");
  spyOn(githubManager, "createPullRequest").mockResolvedValue({
    number: 200,
    title: "Add feature X",
    body: "Single commit stack:\n\n- Add feature X",
    url: "https://github.com/test/repo/pull/200",
    draft: false,
    head: "test/add-feature-x",
    base: "main"
  });

  // Mock state operations
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: [],
    pullRequests: [],
  });
  spyOn(stackManager, "saveState").mockResolvedValue();

  // Test auto-publish
  await stackManager.pushStack(true);

  expect(githubManager.createPullRequest).toHaveBeenCalledWith(
    "Add feature X",
    "Single commit stack:\n\n- Add feature X",
    "test/add-feature-x",
    "main",
    false // draft should be false due to autoPublish
  );
});

test("normal push respects draftPRs config", async () => {
  // Mock config with draftPRs = true
  spyOn(configManager, "getAll").mockResolvedValue({
    defaultBranch: "main",
    userPrefix: "test",
    branchNaming: "sequential",
    autoRebase: false,
    draftPRs: true
  });

  // Mock new commits
  spyOn(gitManager, "getCommitsSince").mockResolvedValue([
    { hash: "abc123", message: "Add feature Y", author: "test", date: "2023-01-01" }
  ]);

  // Mock git operations
  spyOn(gitManager, "generateBranchName").mockReturnValue("test/add-feature-y");
  spyOn(gitManager, "branchExists").mockResolvedValue(false);
  spyOn(gitManager, "createBranch").mockResolvedValue();
  spyOn(gitManager, "pushBranch").mockResolvedValue();
  spyOn(gitManager, "checkoutBranch").mockResolvedValue();

  // Mock GitHub operations
  spyOn(githubManager, "generatePRTitle").mockReturnValue("Add feature Y");
  spyOn(githubManager, "generatePRBody").mockReturnValue("Single commit stack:\n\n- Add feature Y");
  spyOn(githubManager, "createPullRequest").mockResolvedValue({
    number: 201,
    title: "Add feature Y",
    body: "Single commit stack:\n\n- Add feature Y",
    url: "https://github.com/test/repo/pull/201",
    draft: true,
    head: "test/add-feature-y",
    base: "main"
  });

  // Mock state operations
  spyOn(stackManager, "loadState").mockResolvedValue({
    branches: [],
    pullRequests: [],
  });
  spyOn(stackManager, "saveState").mockResolvedValue();

  // Test normal push (autoPublish = false/undefined)
  await stackManager.pushStack(false);

  expect(githubManager.createPullRequest).toHaveBeenCalledWith(
    "Add feature Y",
    "Single commit stack:\n\n- Add feature Y",
    "test/add-feature-y",
    "main",
    true // draft should be true due to draftPRs config
  );
});
