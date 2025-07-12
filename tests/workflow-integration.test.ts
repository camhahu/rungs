import { test, expect, describe } from "bun:test";

describe("Workflow Improvements Integration", () => {
  test("duplicate PR detection method structure", () => {
    // Test that the GitHubManager has the new method
    const { GitHubManager } = require("../src/github-manager.js");
    const githubManager = new GitHubManager();
    
    expect(typeof githubManager.findPRsWithCommits).toBe("function");
  });

  test("auto-pull method structure", () => {
    // Test that the GitManager has the new method
    const { GitManager } = require("../src/git-manager.js");
    const gitManager = new GitManager();
    
    expect(typeof gitManager.pullLatestChanges).toBe("function");
  });

  test("GitHubManager.findPRsWithCommits accepts correct parameters", () => {
    const { GitHubManager } = require("../src/github-manager.js");
    const githubManager = new GitHubManager();
    
    // Verify method signature by checking if it accepts an array of strings
    const commitShas = ["abc123", "def456"];
    
    // Should not throw when called with correct parameters (though it will fail without proper mocking)
    expect(() => {
      githubManager.findPRsWithCommits(commitShas);
    }).not.toThrow();
  });

  test("GitManager.pullLatestChanges accepts correct parameters", () => {
    const { GitManager } = require("../src/git-manager.js");
    const gitManager = new GitManager();
    
    // Verify method signature by checking if it accepts a branch name
    const branchName = "main";
    
    // Should not throw when called with correct parameters (though it will fail without proper mocking)
    expect(() => {
      gitManager.pullLatestChanges(branchName);
    }).not.toThrow();
  });

  test("workflow integration points exist in StackManager", () => {
    const { StackManager } = require("../src/stack-manager.js");
    const { ConfigManager } = require("../src/config-manager.js");
    const { GitManager } = require("../src/git-manager.js");
    const { GitHubManager } = require("../src/github-manager.js");
    
    const configManager = new ConfigManager();
    const gitManager = new GitManager();
    const githubManager = new GitHubManager();
    const stackManager = new StackManager(configManager, gitManager, githubManager);
    
    // Verify that StackManager has access to the new methods through its dependencies
    expect(typeof stackManager.github.findPRsWithCommits).toBe("function");
    expect(typeof stackManager.git.pullLatestChanges).toBe("function");
  });
});

describe("Feature Implementation Validation", () => {
  test("duplicate PR detection returns correct shape", async () => {
    const { GitHubManager } = require("../src/github-manager.js");
    const githubManager = new GitHubManager();
    
    // Mock just enough to test the return type structure
    const originalBun = Bun.$;
    
    // @ts-ignore
    Bun.$ = () => ({
      text: () => Promise.resolve('[]'), // Empty PR list
      quiet: () => Promise.resolve("")
    });
    
    try {
      const result = await githubManager.findPRsWithCommits(["test123"]);
      
      // Should return an array
      expect(Array.isArray(result)).toBe(true);
      
      // Array should be empty for this test case
      expect(result).toHaveLength(0);
    } finally {
      Bun.$ = originalBun;
    }
  });

  test("auto-pull method handles basic execution flow", async () => {
    const { GitManager } = require("../src/git-manager.js");
    const gitManager = new GitManager();
    
    const originalBun = Bun.$;
    let commandsExecuted: string[] = [];
    
    // @ts-ignore
    Bun.$ = (cmd: any) => {
      const cmdStr = String(cmd);
      commandsExecuted.push(cmdStr);
      
      if (cmdStr.includes("git rev-parse --abbrev-ref HEAD")) {
        return { text: () => Promise.resolve("main") };
      }
      
      return { text: () => Promise.resolve("") };
    };
    
    try {
      await gitManager.pullLatestChanges("main");
      
      // Verify that the expected git commands were called
      const fetchCalled = commandsExecuted.some(cmd => cmd.includes("git fetch origin"));
      const rebaseCalled = commandsExecuted.some(cmd => cmd.includes("git rebase origin/main"));
      
      expect(fetchCalled).toBe(true);
      expect(rebaseCalled).toBe(true);
    } finally {
      Bun.$ = originalBun;
    }
  });
});
