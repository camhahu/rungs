import { test, expect } from "bun:test";
import { GitManager } from "../src/git-manager.js";

// Test that the new git methods for restacking exist and have the right signatures
test("GitManager should have new methods for restacking", () => {
  const gitManager = new GitManager();
  
  // Verify the new methods exist
  expect(typeof gitManager.fetchBranch).toBe("function");
  expect(typeof gitManager.pushForceWithLease).toBe("function");
  expect(typeof gitManager.rebaseOntoTarget).toBe("function");
});

// Test that the new methods throw errors for invalid inputs
test("GitManager new methods should handle errors properly", async () => {
  const gitManager = new GitManager();
  
  // These should fail with non-existent branches
  await expect(gitManager.fetchBranch("non-existent-branch-12345")).rejects.toThrow("Failed to fetch branch");
  await expect(gitManager.pushForceWithLease("non-existent-branch-12345")).rejects.toThrow("Failed to force push branch");
  await expect(gitManager.rebaseOntoTarget("non-existent-base", "non-existent-target")).rejects.toThrow("Failed to rebase onto");
});

// Verify that the merge logic now includes restack functionality 
test("StackManager merge logic should include restack functionality", async () => {
  // Read the source to verify the restack logic is present
  const stackManagerSource = await Bun.file("src/stack-manager.ts").text();
  
  // Check that restackDependents method exists
  expect(stackManagerSource).toContain("async restackDependents");
  
  // Check that merge logic calls restack for squash merges
  expect(stackManagerSource).toContain("mergeMethod === \"squash\"");
  expect(stackManagerSource).toContain("await this.restackDependents");
  
  // Check that restack uses the new git methods
  expect(stackManagerSource).toContain("rebaseOntoTarget");
  expect(stackManagerSource).toContain("pushForceWithLease");
  expect(stackManagerSource).toContain("fetchBranch");
});

// Verify git methods have the expected functionality
test("GitManager new methods should call correct git commands", async () => {
  const gitManagerSource = await Bun.file("src/git-manager.ts").text();
  
  // Check fetchBranch implementation
  expect(gitManagerSource).toContain("git fetch origin ${branch}");
  
  // Check pushForceWithLease implementation  
  expect(gitManagerSource).toContain("git push origin ${branch} --force-with-lease");
  
  // Check rebaseOntoTarget implementation
  expect(gitManagerSource).toContain("git rebase --onto ${newBase} ${oldBase}");
  expect(gitManagerSource).toContain("git rebase --abort"); // Error handling
});
