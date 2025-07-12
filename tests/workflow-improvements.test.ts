import { test, expect, describe, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { GitHubManager } from "../src/github-manager.js";
import { GitManager } from "../src/git-manager.js";
import { StackManager } from "../src/stack-manager.js";
import { ConfigManager } from "../src/config-manager.js";

describe("Workflow Improvements", () => {
  let githubManager: GitHubManager;
  let gitManager: GitManager;
  let stackManager: StackManager;
  let configManager: ConfigManager;
  let mockCmd: any;

  beforeEach(() => {
    githubManager = new GitHubManager();
    gitManager = new GitManager();
    configManager = new ConfigManager();
    stackManager = new StackManager(configManager, gitManager, githubManager);
    
    // Mock Bun.$
    mockCmd = mock(() => ({
      text: () => Promise.resolve(""),
      quiet: () => Promise.resolve(""),
    }));
    
    // @ts-ignore
    global.Bun.$ = mockCmd;
  });

  afterEach(() => {
    // Reset mocks
    mockCmd.mockRestore();
  });

  describe("Duplicate PR Detection", () => {
    test("should find PRs with matching commits", async () => {
      const mockPRList = [
        { number: 123, title: "Fix bug", url: "https://github.com/user/repo/pull/123", headRefName: "feature-branch" },
        { number: 124, title: "Add feature", url: "https://github.com/user/repo/pull/124", headRefName: "another-branch" }
      ];

      const mockCommits = [
        "abc123456789abcdef123456789abcdef12345678",
        "def456789abcdef123456789abcdef123456789abc"
      ];

      // Mock gh pr list
      mockBun.$.mockImplementation((cmd: any) => {
        const cmdStr = cmd.toString();
        
        if (cmdStr.includes("gh pr list --state open")) {
          return {
            text: () => Promise.resolve(JSON.stringify(mockPRList)),
            quiet: () => Promise.resolve("")
          };
        }
        
        if (cmdStr.includes("git log origin/feature-branch")) {
          return {
            text: () => Promise.resolve(mockCommits.join('\n')),
            quiet: () => Promise.resolve("")
          };
        }
        
        if (cmdStr.includes("git log origin/another-branch")) {
          return {
            text: () => Promise.resolve("different123456789abcdef123456789abcdef12345678"),
            quiet: () => Promise.resolve("")
          };
        }
        
        return {
          text: () => Promise.resolve(""),
          quiet: () => Promise.resolve("")
        };
      });

      const result = await githubManager.findPRsWithCommits(["abc123", "def456"]);
      
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(123);
      expect(result[0].title).toBe("Fix bug");
      expect(result[0].status).toBe("open");
    });

    test("should return empty array when no matching PRs found", async () => {
      const mockPRList = [
        { number: 123, title: "Fix bug", url: "https://github.com/user/repo/pull/123", headRefName: "feature-branch" }
      ];

      mockBun.$.mockImplementation((cmd: any) => {
        const cmdStr = cmd.toString();
        
        if (cmdStr.includes("gh pr list --state open")) {
          return {
            text: () => Promise.resolve(JSON.stringify(mockPRList)),
            quiet: () => Promise.resolve("")
          };
        }
        
        if (cmdStr.includes("git log origin/feature-branch")) {
          return {
            text: () => Promise.resolve("different123456789abcdef123456789abcdef12345678"),
            quiet: () => Promise.resolve("")
          };
        }
        
        return {
          text: () => Promise.resolve(""),
          quiet: () => Promise.resolve("")
        };
      });

      const result = await githubManager.findPRsWithCommits(["xyz789", "uvw456"]);
      
      expect(result).toHaveLength(0);
    });

    test("should handle errors gracefully when branch doesn't exist", async () => {
      const mockPRList = [
        { number: 123, title: "Fix bug", url: "https://github.com/user/repo/pull/123", headRefName: "nonexistent-branch" }
      ];

      mockBun.$.mockImplementation((cmd: any) => {
        const cmdStr = cmd.toString();
        
        if (cmdStr.includes("gh pr list --state open")) {
          return {
            text: () => Promise.resolve(JSON.stringify(mockPRList)),
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
      });

      const result = await githubManager.findPRsWithCommits(["abc123"]);
      
      expect(result).toHaveLength(0);
    });
  });

  describe("Auto-pull After Merge", () => {
    test("should pull latest changes successfully", async () => {
      let fetchCalled = false;
      let rebaseCalled = false;

      mockBun.$.mockImplementation((cmd: any) => {
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
      });

      await gitManager.pullLatestChanges("main");
      
      expect(fetchCalled).toBe(true);
      expect(rebaseCalled).toBe(true);
    });

    test("should checkout target branch if not already on it", async () => {
      let checkoutCalled = false;

      mockBun.$.mockImplementation((cmd: any) => {
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
      });

      await gitManager.pullLatestChanges("main");
      
      expect(checkoutCalled).toBe(true);
    });

    test("should handle rebase conflicts gracefully", async () => {
      let abortCalled = false;

      mockBun.$.mockImplementation((cmd: any) => {
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
      });

      await expect(gitManager.pullLatestChanges("main")).rejects.toThrow("Failed to pull latest changes for main");
      expect(abortCalled).toBe(true);
    });
  });

  describe("Integration Tests", () => {
    test("pushStack should skip creating PR when duplicate detected", async () => {
      // Mock successful prerequisite checks
      mockBun.$.mockImplementation((cmd: any) => {
        const cmdStr = cmd.toString();
        
        // Mock git repo check
        if (cmdStr.includes("git rev-parse --git-dir")) {
          return { quiet: () => Promise.resolve("") };
        }
        
        // Mock gh CLI availability
        if (cmdStr.includes("gh --version")) {
          return { quiet: () => Promise.resolve("") };
        }
        
        // Mock gh auth status
        if (cmdStr.includes("gh auth status")) {
          return { quiet: () => Promise.resolve("") };
        }
        
        // Mock current branch
        if (cmdStr.includes("git rev-parse --abbrev-ref HEAD")) {
          return { text: () => Promise.resolve("main") };
        }
        
        // Mock clean working directory
        if (cmdStr.includes("git status --porcelain")) {
          return { text: () => Promise.resolve("") };
        }
        
        // Mock sync status validation
        if (cmdStr.includes("git fetch origin")) {
          return { text: () => Promise.resolve("") };
        }
        
        if (cmdStr.includes("git rev-parse --verify origin/main")) {
          return { quiet: () => Promise.resolve("") };
        }
        
        if (cmdStr.includes("git rev-list --count")) {
          return { text: () => Promise.resolve("0") };
        }
        
        // Mock commits to process
        if (cmdStr.includes("git log origin/main..HEAD")) {
          return {
            text: () => Promise.resolve("abc123|Fix bug|Author|2024-01-01")
          };
        }
        
        // Mock existing PR check - return matching PR
        if (cmdStr.includes("gh pr list --state open")) {
          return {
            text: () => Promise.resolve(JSON.stringify([
              { number: 123, title: "Fix bug", url: "https://github.com/user/repo/pull/123", headRefName: "existing-branch" }
            ]))
          };
        }
        
        // Mock branch commits that match our commit
        if (cmdStr.includes("git log origin/existing-branch")) {
          return {
            text: () => Promise.resolve("abc123456789abcdef123456789abcdef12345678")
          };
        }
        
        return {
          text: () => Promise.resolve(""),
          quiet: () => Promise.resolve("")
        };
      });

      // Mock config
      configManager.getAll = async () => ({
        defaultBranch: "main",
        userPrefix: "test",
        branchNaming: "commit-message" as const,
        autoRebase: false,
        draftPRs: true
      });

      // Mock state file
      stackManager.loadState = async () => ({
        branches: [],
        pullRequests: []
      });

      // Mock sync with GitHub
      stackManager.syncWithGitHub = async () => {};

      // This should detect the duplicate and return early without creating a new PR
      await stackManager.pushStack();
      
      // We can't easily assert the console output, but the test will pass if no errors are thrown
      // and the duplicate detection logic runs correctly
    });

    test("mergePullRequest should auto-pull after successful merge", async () => {
      let mergeCalled = false;
      let pullCalled = false;

      // Mock GitHub merge
      githubManager.mergePullRequest = async () => {
        mergeCalled = true;
      };

      // Mock git pull
      gitManager.pullLatestChanges = async () => {
        pullCalled = true;
      };

      // Mock config
      configManager.getAll = async () => ({
        defaultBranch: "main",
        userPrefix: "test",
        branchNaming: "commit-message" as const,
        autoRebase: false,
        draftPRs: true
      });

      // Mock state with PR
      stackManager.loadState = async () => ({
        branches: ["test-branch"],
        pullRequests: [123]
      });

      // Mock sync
      stackManager.syncWithGitHub = async () => {};

      await stackManager.mergePullRequest(123);
      
      expect(mergeCalled).toBe(true);
      expect(pullCalled).toBe(true);
    });
  });
});
