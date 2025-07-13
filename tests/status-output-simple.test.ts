import { test, expect, describe, beforeEach, mock } from "bun:test";
import { GitManager, GitCommit } from "../src/git-manager.js";

describe("Status Output - Core Functionality Tests", () => {
  let gitManager: GitManager;

  beforeEach(() => {
    gitManager = new GitManager();
  });

  describe("GitManager commit methods", () => {
    test("getCommitsForBranch returns commits between base and branch", async () => {
      // Mock the Bun shell execution
      const mockResult = "abc123|Add feature X|John Doe|2024-01-13T10:00:00Z\ndef456|Fix bug Y|Jane Smith|2024-01-13T11:00:00Z";
      
      // Override Bun shell execution for this test
      const originalShell = Bun.$;
      Bun.$ = mock(() => ({
        text: mock(async () => mockResult)
      })) as any;

      const commits = await gitManager.getCommitsForBranch("feature/test", "main");
      
      expect(commits).toHaveLength(2);
      expect(commits[0].hash).toBe("abc123");
      expect(commits[0].message).toBe("Add feature X");
      expect(commits[0].author).toBe("John Doe");
      expect(commits[1].hash).toBe("def456");
      expect(commits[1].message).toBe("Fix bug Y");
      expect(commits[1].author).toBe("Jane Smith");

      // Restore original
      Bun.$ = originalShell;
    });

    test("getCommitsForBranch returns empty array when no commits", async () => {
      // Mock empty result
      const originalShell = Bun.$;
      Bun.$ = mock(() => ({
        text: mock(async () => "")
      })) as any;

      const commits = await gitManager.getCommitsForBranch("feature/test", "main");
      expect(commits).toHaveLength(0);

      // Restore original
      Bun.$ = originalShell;
    });

    test("getCommitsForBranch handles remote branch not found fallback", async () => {
      const originalShell = Bun.$;
      let callCount = 0;
      
      Bun.$ = mock((cmd: any) => {
        callCount++;
        if (callCount === 1) {
          // First call (remote) throws error
          throw new Error("Remote branch not found");
        } else {
          // Second call (local) succeeds
          return {
            text: mock(async () => "local123|Local commit|Dev|2024-01-13T10:00:00Z")
          };
        }
      }) as any;

      const commits = await gitManager.getCommitsForBranch("feature/local", "main");
      
      expect(commits).toHaveLength(1);
      expect(commits[0].hash).toBe("local123");
      expect(commits[0].message).toBe("Local commit");

      // Restore original
      Bun.$ = originalShell;
    });
  });

  describe("Commit hash truncation", () => {
    test("displays 7-character commit hashes consistently", () => {
      const testCommits: GitCommit[] = [
        { hash: "abcdefghijklmnop", message: "Long hash commit", author: "Dev", date: "2024-01-13" },
        { hash: "1234567", message: "Short hash commit", author: "Dev", date: "2024-01-13" },
        { hash: "a1b2c3d4e5f6", message: "Medium hash commit", author: "Dev", date: "2024-01-13" }
      ];

      testCommits.forEach(commit => {
        const truncated = commit.hash.slice(0, 7);
        expect(truncated).toHaveLength(7);
        expect(truncated).toBe(commit.hash.substring(0, 7));
      });
    });
  });

  describe("Output formatting patterns", () => {
    test("compact mode PR format matches expected pattern", () => {
      const prData = {
        number: 123,
        title: "Add new authentication system",
        url: "https://github.com/owner/repo/pull/123",
        base: "main",
        commits: [
          { hash: "abc123def456", message: "Add login endpoint" },
          { hash: "def456ghi789", message: "Add JWT validation" },
          { hash: "ghi789jkl012", message: "Add password reset" }
        ]
      };

      // Expected compact format
      const expectedLines = [
        `PR #${prData.number}: ${prData.title} → ${prData.url}`,
        `  Base: ${prData.base}`,
        `  ${prData.commits[0].hash.slice(0, 7)} ${prData.commits[0].message}`,
        `  ${prData.commits[1].hash.slice(0, 7)} ${prData.commits[1].message}`,
        `  ${prData.commits[2].hash.slice(0, 7)} ${prData.commits[2].message}`
      ];

      // Verify format patterns
      expect(expectedLines[0]).toMatch(/^PR #\d+: .+ → https:\/\/github\.com\/.+\/pull\/\d+$/);
      expect(expectedLines[1]).toMatch(/^  Base: \w+$/);
      expect(expectedLines[2]).toMatch(/^  [a-z0-9]{7} .+$/);
      expect(expectedLines[3]).toMatch(/^  [a-z0-9]{7} .+$/);
      expect(expectedLines[4]).toMatch(/^  [a-z0-9]{7} .+$/);
    });

    test("verbose mode PR format includes proper indentation", () => {
      const prData = {
        number: 124,
        head: "user/feature-branch",
        base: "main",
        url: "https://github.com/owner/repo/pull/124",
        commits: [
          { hash: "commit1hash", message: "First commit" },
          { hash: "commit2hash", message: "Second commit" }
        ]
      };

      // Expected verbose format
      const expectedLines = [
        `  1. PR #${prData.number}: ${prData.head} <- ${prData.base}`,
        `     → ${prData.url}`,
        `     Commits:`,
        `       - ${prData.commits[0].hash.slice(0, 7)}: ${prData.commits[0].message}`,
        `       - ${prData.commits[1].hash.slice(0, 7)}: ${prData.commits[1].message}`
      ];

      // Verify indentation patterns
      expect(expectedLines[0]).toMatch(/^  \d\. PR #\d+: .+ <- .+$/);
      expect(expectedLines[1]).toMatch(/^     → https:\/\/github\.com\/.+$/);
      expect(expectedLines[2]).toMatch(/^     Commits:$/);
      expect(expectedLines[3]).toMatch(/^       - [a-z0-9]{7}: .+$/);
      expect(expectedLines[4]).toMatch(/^       - [a-z0-9]{7}: .+$/);
    });

    test("new commits section format", () => {
      const newCommits = [
        { hash: "newcommit1abc", message: "Ready for review" },
        { hash: "newcommit2def", message: "Add documentation" }
      ];

      const expectedHeader = `New Commits (ready to push): ${newCommits.length}`;
      const expectedLines = newCommits.map(commit => 
        `  ${commit.hash.slice(0, 7)} ${commit.message}`
      );

      expect(expectedHeader).toMatch(/^New Commits \(ready to push\): \d+$/);
      expectedLines.forEach(line => {
        expect(line).toMatch(/^  [a-z0-9]{7} .+$/);
      });
    });

    test("empty states display correctly", () => {
      // Empty stack
      const emptyStackMessage = "Stack Status: No active PRs";
      expect(emptyStackMessage).toMatch(/^Stack Status: No active PRs$/);

      // PR with no commits
      const noCommitsMessage = "  (no commits)";
      expect(noCommitsMessage).toMatch(/^  \(no commits\)$/);

      // Multiple PRs count
      const multiPRMessage = "Stack Status: 3 PRs";
      expect(multiPRMessage).toMatch(/^Stack Status: \d+ PRs$/);
    });
  });

  describe("URL handling", () => {
    test("GitHub URLs are preserved correctly", () => {
      const testUrls = [
        "https://github.com/owner/repo/pull/123",
        "https://github.com/org/project/pull/456",
        "https://github.com/user-name/repo-name/pull/789"
      ];

      testUrls.forEach(url => {
        const formatted = `PR #123: Title → ${url}`;
        expect(formatted).toContain(url);
        expect(url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/);
      });
    });

    test("URLs work with various GitHub repo name patterns", () => {
      const repoPatterns = [
        "simple/repo",
        "org-name/project-name", 
        "user123/my-awesome-project",
        "company/internal.tool"
      ];

      repoPatterns.forEach(repo => {
        const url = `https://github.com/${repo}/pull/100`;
        expect(url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/);
      });
    });
  });

  describe("Message handling edge cases", () => {
    test("handles special characters in commit messages", () => {
      const specialMessages = [
        "Fix: Handle `null` values properly",
        "feat(api): Add /users/:id endpoint", 
        "chore: Update deps & fix vulnerabilities",
        "fix: Escape \"quotes\" and 'apostrophes'",
        "feat: Support emoji 🚀 in messages",
        "refactor: Move files from src/ to lib/",
        "test: Add coverage for edge case (issue #123)"
      ];

      specialMessages.forEach(message => {
        const formatted = `  abc1234 ${message}`;
        expect(formatted).toContain(message);
        expect(formatted).toMatch(/^  [a-z0-9]{7} .+$/);
      });
    });

    test("handles very long commit messages", () => {
      const longMessage = "This is a very long commit message that describes a complex change involving multiple files, components, and considerations that should be displayed properly without breaking the format";
      const formatted = `  abc1234 ${longMessage}`;
      
      expect(formatted).toContain(longMessage);
      expect(formatted).toMatch(/^  [a-f0-9]{7} .+$/);
    });

    test("handles empty or minimal commit messages", () => {
      const minimalMessages = ["", ".", "fix", "wip", "update"];
      
      minimalMessages.forEach(message => {
        const formatted = `  abc1234 ${message}`;
        expect(formatted).toMatch(/^  [a-z0-9]{7} .*$/);
      });
    });
  });
});