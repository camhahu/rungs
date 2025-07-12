import { test, expect } from "bun:test";
import { StackManager } from "../src/stack-manager";
import { ConfigManager } from "../src/config-manager";
import { GitManager } from "../src/git-manager";
import { GitHubManager } from "../src/github-manager";

test("REGRESSION: autoRebaseAfterMerges should not cause infinite recursion", async () => {
  const config = new ConfigManager();
  const git = new GitManager();
  
  // Mock GitHub manager that tracks how many times methods are called
  let syncCallCount = 0;
  let updatePRCallCount = 0;
  
  const mockGitHub = {
    getPullRequestStatus: async (prNumber: number) => {
      if (prNumber === 1) return "merged";
      if (prNumber === 2) return "open";
      return "closed";
    },
    getPullRequest: async (branchName: string) => ({
      number: 2,
      title: "Test PR",
      body: "Test body",
      url: "https://github.com/test/test/pull/2",
      draft: false,
      head: branchName,
      base: "camhahu/fix-status-showing-incorrect-new-commits-ready-cou" // Wrong base
    }),
    updatePullRequestBase: async (prNumber: number, newBase: string) => {
      updatePRCallCount++;
      // Should not trigger more sync calls
    }
  } as any;
  
  const stackManager = new StackManager(config, git, mockGitHub);
  
  // Create a state with some PRs where one was merged
  const testState = {
    branches: ["branch1", "branch2"],
    pullRequests: [1, 2],
    lastBranch: "branch2"
  };
  
  await stackManager.saveState(testState);
  
  // Mock branchExistsOnGitHub to return false for the old branch
  (stackManager as any).branchExistsOnGitHub = async (branchName: string) => {
    return branchName !== "camhahu/fix-status-showing-incorrect-new-commits-ready-cou";
  };
  
  // Call syncWithGitHub - this should not cause infinite recursion
  await stackManager.syncWithGitHub();
  
  // Verify that updatePullRequestBase was called but we didn't get infinite recursion
  expect(updatePRCallCount).toBeGreaterThan(0);
  expect(updatePRCallCount).toBeLessThan(10); // Should not be called too many times
  
  // Verify the state was updated correctly (merged PR removed)
  const newState = await stackManager.loadState();
  expect(newState.pullRequests).toEqual([2]); // Only the open PR remains
  expect(newState.branches).toEqual(["branch2"]); // Only the corresponding branch remains
});

test("REGRESSION: should detect and fix PRs with incorrect bases", async () => {
  const config = new ConfigManager();
  const git = new GitManager();
  
  let fixIncorrectBasesCallCount = 0;
  
  const mockGitHub = {
    getPullRequestStatus: async (prNumber: number) => "open",
    getPullRequest: async (branchName: string) => ({
      number: 13,
      title: "Test PR",
      body: "Test body", 
      url: "https://github.com/test/test/pull/13",
      draft: false,
      head: branchName,
      base: "camhahu/fix-status-showing-incorrect-new-commits-ready-cou" // Wrong base - should be main
    }),
    updatePullRequestBase: async (prNumber: number, newBase: string) => {
      expect(prNumber).toBe(13);
      expect(newBase).toBe("main"); // Should be corrected to main
      fixIncorrectBasesCallCount++;
    }
  } as any;
  
  const stackManager = new StackManager(config, git, mockGitHub);
  
  // Create a state with one PR that has wrong base
  const testState = {
    branches: ["branch1"],
    pullRequests: [13], 
    lastBranch: "branch1"
  };
  
  await stackManager.saveState(testState);
  
  // Mock branchExistsOnGitHub to return false for the old branch (it was merged/deleted)
  (stackManager as any).branchExistsOnGitHub = async (branchName: string) => {
    return branchName !== "camhahu/fix-status-showing-incorrect-new-commits-ready-cou";
  };
  
  // Call syncWithGitHub - this should detect and fix the incorrect base
  await stackManager.syncWithGitHub();
  
  // Verify that the incorrect base was detected and fixed
  expect(fixIncorrectBasesCallCount).toBe(1);
});
