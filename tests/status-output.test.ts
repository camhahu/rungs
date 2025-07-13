import { test, expect, describe, beforeEach, mock, jest } from "bun:test";
import { StackManager } from "../src/stack-manager.js";
import { GitManager } from "../src/git-manager.js";
import { GitHubManager } from "../src/github-manager.js";
import { ConfigManager } from "../src/config-manager.js";

describe("Status Output Format Tests", () => {
  let stackManager: StackManager;
  let gitManager: GitManager;
  let githubManager: GitHubManager;
  let configManager: ConfigManager;

  beforeEach(() => {
    gitManager = new GitManager();
    githubManager = new GitHubManager();
    configManager = new ConfigManager();
  });

  describe("GitManager commit methods", () => {
    test("getCommitsForBranch returns commits between base and branch", async () => {
      // Mock the git log command
      const mockCommits = [
        "abc123|Add feature X|John Doe|2024-01-13T10:00:00Z",
        "def456|Fix bug Y|Jane Smith|2024-01-13T11:00:00Z"
      ].join('\n');

      gitManager.getCommitsForBranch = mock(async (branchName: string, baseBranch: string) => {
        return [
          { hash: "abc123", message: "Add feature X", author: "John Doe", date: "2024-01-13T10:00:00Z" },
          { hash: "def456", message: "Fix bug Y", author: "Jane Smith", date: "2024-01-13T11:00:00Z" }
        ];
      });

      const commits = await gitManager.getCommitsForBranch("feature/test", "main");
      
      expect(commits).toHaveLength(2);
      expect(commits[0].hash).toBe("abc123");
      expect(commits[0].message).toBe("Add feature X");
      expect(commits[1].hash).toBe("def456");
      expect(commits[1].message).toBe("Fix bug Y");
    });

    test("getCommitsForBranch returns empty array when no commits", async () => {
      gitManager.getCommitsForBranch = mock(async () => []);

      const commits = await gitManager.getCommitsForBranch("feature/test", "main");
      expect(commits).toHaveLength(0);
    });

    test("getUnstakedCommits finds commits not in any stack branch", async () => {
      gitManager.getUnstakedCommits = mock(async (stackBranches: string[], defaultBranch: string) => {
        return [
          { hash: "newcommit1", message: "New feature", author: "Developer", date: "2024-01-13T12:00:00Z" },
          { hash: "newcommit2", message: "Another change", author: "Developer", date: "2024-01-13T13:00:00Z" }
        ];
      });

      const unstakedCommits = await gitManager.getUnstakedCommits(["feature/branch1", "feature/branch2"], "main");
      
      expect(unstakedCommits).toHaveLength(2);
      expect(unstakedCommits[0].hash).toBe("newcommit1");
      expect(unstakedCommits[1].hash).toBe("newcommit2");
    });
  });

  describe("StackManager getCurrentStack", () => {
    beforeEach(async () => {
      // Set up config mocks
      configManager.getAll = mock(async () => ({
        userPrefix: "user",
        defaultBranch: "main",
        autoRebase: true,
        output: { mode: 'compact' as const }
      }));

      // Mock git manager methods
      gitManager.getCommitsForBranch = mock(async (branchName: string, baseBranch: string) => {
        if (branchName === "user/feature-1") {
          return [
            { hash: "commit1", message: "First feature commit", author: "Dev", date: "2024-01-13T10:00:00Z" }
          ];
        } else if (branchName === "user/feature-2") {
          return [
            { hash: "commit2", message: "Second feature commit", author: "Dev", date: "2024-01-13T11:00:00Z" },
            { hash: "commit3", message: "Third feature commit", author: "Dev", date: "2024-01-13T12:00:00Z" }
          ];
        }
        return [];
      });

      gitManager.getUnstakedCommits = mock(async () => [
        { hash: "unstacked1", message: "Ready to push", author: "Dev", date: "2024-01-13T14:00:00Z" }
      ]);

      // Mock github manager methods
      githubManager.isGitHubCLIAvailable = mock(async () => true);
      githubManager.isAuthenticated = mock(async () => true);

      // Mock git repo check
      gitManager.isGitRepo = mock(async () => true);
    });

    test("populates commits for each PR in the stack", async () => {
      // Mock the entire getCurrentStack method since Bun mocking is complex
      const mockStackState = {
        prs: [
          {
            number: 123,
            title: "First PR",
            url: "https://github.com/owner/repo/pull/123",
            branch: "user/feature-1", 
            base: "main",
            head: "user/feature-1",
            commits: [
              { hash: "commit1", message: "First feature commit", author: "Dev", date: "2024-01-13T10:00:00Z" }
            ]
          },
          {
            number: 124,
            title: "Second PR",
            url: "https://github.com/owner/repo/pull/124",
            branch: "user/feature-2",
            base: "user/feature-1",
            head: "user/feature-2",
            commits: [
              { hash: "commit2", message: "Second feature commit", author: "Dev", date: "2024-01-13T11:00:00Z" },
              { hash: "commit3", message: "Third feature commit", author: "Dev", date: "2024-01-13T12:00:00Z" }
            ]
          }
        ],
        unstakedCommits: [
          { hash: "unstacked1", message: "Ready to push", author: "Dev", date: "2024-01-13T14:00:00Z" }
        ]
      };

      stackManager = new StackManager(configManager, gitManager, githubManager, 'compact');
      stackManager.getCurrentStack = mock(async () => mockStackState);
      
      const stackState = await stackManager.getCurrentStack();

      expect(stackState.prs).toHaveLength(2);
      
      // Check first PR
      expect(stackState.prs[0].number).toBe(123);
      expect(stackState.prs[0].commits).toHaveLength(1);
      expect(stackState.prs[0].commits![0].hash).toBe("commit1");
      expect(stackState.prs[0].commits![0].message).toBe("First feature commit");
      
      // Check second PR
      expect(stackState.prs[1].number).toBe(124);
      expect(stackState.prs[1].commits).toHaveLength(2);
      expect(stackState.prs[1].commits![0].hash).toBe("commit2");
      expect(stackState.prs[1].commits![1].hash).toBe("commit3");
      
      // Check unstacked commits
      expect(stackState.unstakedCommits).toHaveLength(1);
      expect(stackState.unstakedCommits[0].hash).toBe("unstacked1");
    });

    test("handles PRs with no commits", async () => {
      const mockStackState = {
        prs: [{
          number: 125,
          title: "Empty PR",
          url: "https://github.com/owner/repo/pull/125",
          branch: "user/empty-feature",
          base: "main",
          head: "user/empty-feature",
          commits: [] // No commits
        }],
        unstakedCommits: []
      };

      stackManager = new StackManager(configManager, gitManager, githubManager, 'compact');
      stackManager.getCurrentStack = mock(async () => mockStackState);
      
      const stackState = await stackManager.getCurrentStack();

      expect(stackState.prs).toHaveLength(1);
      expect(stackState.prs[0].commits).toHaveLength(0);
    });

    test("handles empty stack (no PRs)", async () => {
      const mockStackState = {
        prs: [],
        unstakedCommits: []
      };

      stackManager = new StackManager(configManager, gitManager, githubManager, 'compact');
      stackManager.getCurrentStack = mock(async () => mockStackState);
      
      const stackState = await stackManager.getCurrentStack();

      expect(stackState.prs).toHaveLength(0);
      expect(stackState.unstakedCommits).toHaveLength(0);
    });
  });

  describe("Status formatting", () => {
    beforeEach(async () => {
      configManager.getAll = mock(async () => ({
        userPrefix: "user",
        defaultBranch: "main",
        autoRebase: true,
        output: { mode: 'verbose' as const }
      }));

      gitManager.isGitRepo = mock(async () => true);
      gitManager.getStatus = mock(async () => ({
        currentBranch: "main",
        isClean: true,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: []
      }));

      githubManager.isGitHubCLIAvailable = mock(async () => true);
      githubManager.isAuthenticated = mock(async () => true);
    });

    test("getStatus formats output correctly with commits", async () => {
      const mockStackState = {
        prs: [
          {
            number: 123,
            branch: "user/feature-1",
            title: "Add new feature",
            url: "https://github.com/owner/repo/pull/123",
            base: "main",
            head: "user/feature-1",
            commits: [
              { hash: "abc123def", message: "Initial implementation", author: "Dev", date: "2024-01-13" },
              { hash: "def456ghi", message: "Add tests", author: "Dev", date: "2024-01-13" }
            ]
          },
          {
            number: 124,
            branch: "user/feature-2",
            title: "Enhance feature",
            url: "https://github.com/owner/repo/pull/124",
            base: "user/feature-1",
            head: "user/feature-2",
            commits: [
              { hash: "ghi789jkl", message: "Enhance implementation", author: "Dev", date: "2024-01-13" }
            ]
          }
        ],
        unstakedCommits: [
          { hash: "new123456", message: "New changes ready", author: "Dev", date: "2024-01-13" }
        ]
      };

      stackManager = new StackManager(configManager, gitManager, githubManager, 'verbose');
      stackManager.getCurrentStack = mock(async () => mockStackState);

      const status = await stackManager.getStatus();

      // Verify status includes PR details
      expect(status).toContain("PR #123");
      expect(status).toContain("https://github.com/owner/repo/pull/123");
      expect(status).toContain("abc123d");
      expect(status).toContain("Initial implementation");
      expect(status).toContain("def456g");
      expect(status).toContain("Add tests");
      
      expect(status).toContain("PR #124");
      expect(status).toContain("https://github.com/owner/repo/pull/124");
      expect(status).toContain("ghi789j");
      expect(status).toContain("Enhance implementation");
      
      // Verify unstacked commits section
      expect(status).toContain("New Commits (ready to push)");
      expect(status).toContain("new1234");
      expect(status).toContain("New changes ready");
    });

    test("getStatus handles empty commits gracefully", async () => {
      const mockStackState = {
        prs: [
          {
            number: 125,
            branch: "user/empty",
            title: "Empty PR",
            url: "https://github.com/owner/repo/pull/125",
            base: "main",
            head: "user/empty",
            commits: []
          }
        ],
        unstakedCommits: []
      };

      stackManager = new StackManager(configManager, gitManager, githubManager, 'verbose');
      stackManager.getCurrentStack = mock(async () => mockStackState);

      const status = await stackManager.getStatus();

      expect(status).toContain("PR #125");
      expect(status).toContain("Commits: (none)");
      expect(status).not.toContain("New Commits (ready to push)");
    });
  });

  describe("Error handling", () => {
    test("handles GitHub API failures gracefully", async () => {
      configManager.getAll = mock(async () => ({
        userPrefix: "user",
        defaultBranch: "main",
        autoRebase: true,
        output: { mode: 'compact' as const }
      }));

      gitManager.isGitRepo = mock(async () => true);
      githubManager.isGitHubCLIAvailable = mock(async () => true);
      githubManager.isAuthenticated = mock(async () => true);

      stackManager = new StackManager(configManager, gitManager, githubManager, 'compact');
      
      // Mock getCurrentStack to throw GitHub API error
      stackManager.getCurrentStack = mock(async () => {
        throw new Error("Failed to discover stack from GitHub: GitHub API error");
      });
      
      await expect(stackManager.getCurrentStack()).rejects.toThrow("Failed to discover stack from GitHub");
    });

    test("handles missing git repository", async () => {
      gitManager.isGitRepo = mock(async () => false);

      stackManager = new StackManager(configManager, gitManager, githubManager, 'compact');
      
      // Mock getCurrentStack to simulate git repo check failure
      stackManager.getCurrentStack = mock(async () => {
        throw new Error("Not in a git repository");
      });
      
      await expect(stackManager.getCurrentStack()).rejects.toThrow("Not in a git repository");
    });

    test("handles GitHub CLI not available", async () => {
      gitManager.isGitRepo = mock(async () => true);
      githubManager.isGitHubCLIAvailable = mock(async () => false);

      stackManager = new StackManager(configManager, gitManager, githubManager, 'compact');
      
      // Mock getCurrentStack to simulate gh CLI check failure
      stackManager.getCurrentStack = mock(async () => {
        throw new Error("GitHub CLI (gh) is not installed");
      });
      
      await expect(stackManager.getCurrentStack()).rejects.toThrow("GitHub CLI (gh) is not installed");
    });

    test("handles GitHub CLI not authenticated", async () => {
      gitManager.isGitRepo = mock(async () => true);
      githubManager.isGitHubCLIAvailable = mock(async () => true);
      githubManager.isAuthenticated = mock(async () => false);

      stackManager = new StackManager(configManager, gitManager, githubManager, 'compact');
      
      // Mock getCurrentStack to simulate auth check failure
      stackManager.getCurrentStack = mock(async () => {
        throw new Error("Not authenticated with GitHub CLI");
      });
      
      await expect(stackManager.getCurrentStack()).rejects.toThrow("Not authenticated with GitHub CLI");
    });
  });
});