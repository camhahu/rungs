import { test, expect, describe } from "bun:test";
import { GitManager } from "../src/git-manager.js";

describe("Auto-pull After Merge", () => {
  test("should pull latest changes successfully", async () => {
    const gitManager = new GitManager();
    
    const originalBun = Bun.$;
    let fetchCalled = false;
    let rebaseCalled = false;
    
    // @ts-ignore
    Bun.$ = (cmd: any) => {
      const cmdStr = cmd.toString();
      
      if (cmdStr.includes("git rev-parse --abbrev-ref HEAD")) {
        return {
          text: () => Promise.resolve("main"),
          quiet: () => Promise.resolve("")
        };
      }
      
      if (cmdStr.includes("git fetch origin")) {
        fetchCalled = true;
        return {
          text: () => Promise.resolve(""),
          quiet: () => Promise.resolve("")
        };
      }
      
      if (cmdStr.includes("git rebase origin/main")) {
        rebaseCalled = true;
        return {
          text: () => Promise.resolve(""),
          quiet: () => Promise.resolve("")
        };
      }
      
      return {
        text: () => Promise.resolve(""),
        quiet: () => Promise.resolve("")
      };
    };
    
    try {
      await gitManager.pullLatestChanges("main");
      
      expect(fetchCalled).toBe(true);
      expect(rebaseCalled).toBe(true);
    } finally {
      Bun.$ = originalBun;
    }
  });

  test("should checkout target branch if not already on it", async () => {
    const gitManager = new GitManager();
    
    const originalBun = Bun.$;
    let checkoutCalled = false;
    
    // @ts-ignore
    Bun.$ = (cmd: any) => {
      const cmdStr = cmd.toString();
      
      if (cmdStr.includes("git rev-parse --abbrev-ref HEAD")) {
        return {
          text: () => Promise.resolve("feature-branch"),
          quiet: () => Promise.resolve("")
        };
      }
      
      if (cmdStr.includes("git checkout main")) {
        checkoutCalled = true;
        return {
          text: () => Promise.resolve(""),
          quiet: () => Promise.resolve("")
        };
      }
      
      return {
        text: () => Promise.resolve(""),
        quiet: () => Promise.resolve("")
      };
    };
    
    try {
      await gitManager.pullLatestChanges("main");
      expect(checkoutCalled).toBe(true);
    } finally {
      Bun.$ = originalBun;
    }
  });

  test("should handle rebase conflicts gracefully", async () => {
    const gitManager = new GitManager();
    
    const originalBun = Bun.$;
    let abortCalled = false;
    
    // @ts-ignore
    Bun.$ = (cmd: any) => {
      const cmdStr = cmd.toString();
      
      if (cmdStr.includes("git rev-parse --abbrev-ref HEAD")) {
        return {
          text: () => Promise.resolve("main"),
          quiet: () => Promise.resolve("")
        };
      }
      
      if (cmdStr.includes("git rebase origin/main")) {
        throw new Error("CONFLICT (content): Merge conflict in file.txt");
      }
      
      if (cmdStr.includes("git rebase --abort")) {
        abortCalled = true;
        return {
          text: () => Promise.resolve(""),
          quiet: () => Promise.resolve("")
        };
      }
      
      return {
        text: () => Promise.resolve(""),
        quiet: () => Promise.resolve("")
      };
    };
    
    try {
      await expect(gitManager.pullLatestChanges("main")).rejects.toThrow("Failed to pull latest changes for main");
      expect(abortCalled).toBe(true);
    } finally {
      Bun.$ = originalBun;
    }
  });
});
