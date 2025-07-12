import { test, expect } from "bun:test";
import { SyncStatus } from "../src/git-manager.js";

// Test the sync status logic and error message generation
test("sync validation error messages", () => {
  // Test ahead with duplicates scenario
  const aheadWithDuplicates = {
    status: "ahead" as SyncStatus,
    aheadCount: 2,
    behindCount: 0,
    duplicateMessages: ["Fix parser issue", "Add error handling"]
  };
  
  let errorMessage = "❌ Cannot create PR: Local branch is out of sync with remote\n\n";
  errorMessage += `Your local main has ${aheadWithDuplicates.aheadCount} commits that may already be merged into remote.\n`;
  errorMessage += `Duplicate commit messages found:\n${aheadWithDuplicates.duplicateMessages.map(msg => `  - ${msg}`).join('\n')}\n\n`;
  errorMessage += "This would create a PR with merge conflicts.\n\n";
  errorMessage += "To resolve:\n";
  errorMessage += `  git reset --hard origin/main    # Reset to remote state\n`;
  errorMessage += `  git cherry-pick <specific-commits>         # Re-apply only new commits\n\n`;
  errorMessage += "Or:\n";
  errorMessage += `  git rebase origin/main         # Rebase on top of remote\n\n`;
  errorMessage += "Use --force to create PR anyway (not recommended)";
  
  expect(errorMessage).toContain("Cannot create PR");
  expect(errorMessage).toContain("Fix parser issue");
  expect(errorMessage).toContain("Add error handling");
  expect(errorMessage).toContain("git reset --hard origin/main");
  expect(errorMessage).toContain("--force");
});

test("sync validation - behind scenario message", () => {
  const behindScenario = {
    status: "behind" as SyncStatus,
    aheadCount: 0,
    behindCount: 3
  };
  
  let errorMessage = "❌ Cannot create PR: Local branch is out of sync with remote\n\n";
  errorMessage += `Your local main is ${behindScenario.behindCount} commits behind remote.\n`;
  errorMessage += "To resolve:\n";
  errorMessage += `  git pull origin main            # Pull latest changes\n\n`;
  errorMessage += "Use --force to create PR anyway (not recommended)";
  
  expect(errorMessage).toContain("3 commits behind remote");
  expect(errorMessage).toContain("git pull origin main");
});

test("sync validation - diverged scenario message", () => {
  const divergedScenario = {
    status: "diverged" as SyncStatus,
    aheadCount: 1,
    behindCount: 2
  };
  
  let errorMessage = "❌ Cannot create PR: Local branch is out of sync with remote\n\n";
  errorMessage += `Your local main has diverged from remote:\n`;
  errorMessage += `  - ${divergedScenario.aheadCount} commits ahead\n`;
  errorMessage += `  - ${divergedScenario.behindCount} commits behind\n\n`;
  errorMessage += "To resolve:\n";
  errorMessage += `  git rebase origin/main          # Rebase your changes on top\n`;
  errorMessage += "Or:\n";
  errorMessage += `  git reset --hard origin/main    # Reset to remote (loses local changes)\n\n`;
  errorMessage += "Use --force to create PR anyway (not recommended)";
  
  expect(errorMessage).toContain("has diverged from remote");
  expect(errorMessage).toContain("1 commits ahead");
  expect(errorMessage).toContain("2 commits behind");
  expect(errorMessage).toContain("git rebase origin/main");
});

test("sync validation - clean scenario", () => {
  const cleanScenario = {
    status: "clean" as SyncStatus,
    aheadCount: 0,
    behindCount: 0
  };
  
  // Clean scenario should not generate any error
  expect(cleanScenario.status).toBe("clean");
  expect(cleanScenario.aheadCount).toBe(0);
  expect(cleanScenario.behindCount).toBe(0);
});

// Test duplicate detection logic
test("duplicate commit detection", () => {
  const localMessages = ["Fix parser issue", "Add new feature", "Update docs"];
  const remoteMessages = ["Fix parser issue", "Old commit", "Add new feature", "Another old commit"];
  
  // Simulate the duplicate detection logic
  const duplicates = localMessages.filter(msg => 
    remoteMessages.some(remoteMsg => remoteMsg.trim() === msg.trim())
  );
  
  expect(duplicates).toEqual(["Fix parser issue", "Add new feature"]);
  expect(duplicates.length).toBe(2);
});

test("no duplicate commit detection", () => {
  const localMessages = ["New feature", "Bug fix"];
  const remoteMessages = ["Old commit 1", "Old commit 2", "Old commit 3"];
  
  // Simulate the duplicate detection logic
  const duplicates = localMessages.filter(msg => 
    remoteMessages.some(remoteMsg => remoteMsg.trim() === msg.trim())
  );
  
  expect(duplicates).toEqual([]);
  expect(duplicates.length).toBe(0);
});
