import { test, expect, describe } from "bun:test";
import { GitHubManager } from "../src/github-manager.js";

describe("Duplicate PR Detection", () => {
  test("should find PRs with matching commits", async () => {
    const githubManager = new GitHubManager();
    
    // Mock the Bun.$ calls within the GitHubManager
    const originalBun = Bun.$;
    const mockResults = new Map();
    
    mockResults.set("gh pr list --state open --json number,title,url,headRefName", JSON.stringify([
      { number: 123, title: "Fix bug", url: "https://github.com/user/repo/pull/123", headRefName: "feature-branch" },
      { number: 124, title: "Add feature", url: "https://github.com/user/repo/pull/124", headRefName: "another-branch" }
    ]));
    
    mockResults.set("git log origin/feature-branch --pretty=format:\"%H\"", "abc123456789abcdef123456789abcdef12345678\ndef456789abcdef123456789abcdef123456789abc");
    mockResults.set("git log origin/another-branch --pretty=format:\"%H\"", "different123456789abcdef123456789abcdef12345678");
    
    // @ts-ignore
    Bun.$ = (cmd: any) => {
      const cmdStr = cmd.toString();
      const mockResult = Array.from(mockResults.keys()).find(key => cmdStr.includes(key));
      
      if (mockResult) {
        return {
          text: () => Promise.resolve(mockResults.get(mockResult)),
          quiet: () => Promise.resolve("")
        };
      }
      
      return {
        text: () => Promise.resolve(""),
        quiet: () => Promise.resolve("")
      };
    };
    
    try {
      const result = await githubManager.findPRsWithCommits(["abc123", "def456"]);
      
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(123);
      expect(result[0].title).toBe("Fix bug");
      expect(result[0].status).toBe("open");
    } finally {
      // Restore original Bun.$
      Bun.$ = originalBun;
    }
  });

  test("should return empty array when no matching PRs found", async () => {
    const githubManager = new GitHubManager();
    
    const originalBun = Bun.$;
    const mockResults = new Map();
    
    mockResults.set("gh pr list --state open --json number,title,url,headRefName", JSON.stringify([
      { number: 123, title: "Fix bug", url: "https://github.com/user/repo/pull/123", headRefName: "feature-branch" }
    ]));
    
    mockResults.set("git log origin/feature-branch --pretty=format:\"%H\"", "different123456789abcdef123456789abcdef12345678");
    
    // @ts-ignore
    Bun.$ = (cmd: any) => {
      const cmdStr = cmd.toString();
      const mockResult = Array.from(mockResults.keys()).find(key => cmdStr.includes(key));
      
      if (mockResult) {
        return {
          text: () => Promise.resolve(mockResults.get(mockResult)),
          quiet: () => Promise.resolve("")
        };
      }
      
      return {
        text: () => Promise.resolve(""),
        quiet: () => Promise.resolve("")
      };
    };
    
    try {
      const result = await githubManager.findPRsWithCommits(["xyz789", "uvw456"]);
      expect(result).toHaveLength(0);
    } finally {
      Bun.$ = originalBun;
    }
  });

  test("should handle errors gracefully when branch doesn't exist", async () => {
    const githubManager = new GitHubManager();
    
    const originalBun = Bun.$;
    const mockResults = new Map();
    
    mockResults.set("gh pr list --state open --json number,title,url,headRefName", JSON.stringify([
      { number: 123, title: "Fix bug", url: "https://github.com/user/repo/pull/123", headRefName: "nonexistent-branch" }
    ]));
    
    // @ts-ignore
    Bun.$ = (cmd: any) => {
      const cmdStr = cmd.toString();
      
      if (cmdStr.includes("gh pr list --state open")) {
        return {
          text: () => Promise.resolve(mockResults.get("gh pr list --state open --json number,title,url,headRefName")),
          quiet: () => Promise.resolve("")
        };
      }
      
      if (cmdStr.includes("git log origin/nonexistent-branch")) {
        throw new Error("fatal: bad revision 'origin/nonexistent-branch'");
      }
      
      return {
        text: () => Promise.resolve(""),
        quiet: () => Promise.resolve("")
      };
    };
    
    try {
      const result = await githubManager.findPRsWithCommits(["abc123"]);
      expect(result).toHaveLength(0);
    } finally {
      Bun.$ = originalBun;
    }
  });
});
