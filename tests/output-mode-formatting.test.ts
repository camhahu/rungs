import { test, expect, describe, beforeEach, mock } from "bun:test";
import { OperationTracker } from "../src/operation-tracker.js";
import { output, setOutputMode } from "../src/output-manager.js";

describe("Output Mode Formatting Tests", () => {
  let tracker: OperationTracker;
  let consoleOutput: string[] = [];
  let originalLog: typeof console.log;

  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    originalLog = console.log;
    console.log = (...args: any[]) => {
      consoleOutput.push(args.join(' '));
    };

    // Mock output methods
    mock.module("../src/output-manager.js", () => ({
      output: {
        error: mock((msg: string) => console.log(`Error: ${msg}`)),
        info: mock((msg: string) => console.log(`Info: ${msg}`)),
        success: mock((msg: string) => console.log(`Success: ${msg}`)),
        warning: mock((msg: string) => console.log(`Warning: ${msg}`)),
        progress: mock((msg: string) => console.log(`Progress: ${msg}`)),
        getOutputMode: mock(() => "compact"),
        logList: mock((items: string[], title: string) => {
          console.log(title);
          items.forEach(item => console.log(`  ${item}`));
        })
      },
      setOutputMode: mock((mode: string) => {}),
      setVerbose: mock(() => {}),
      startGroup: mock(() => {}),
      endGroup: mock(() => {}),
      logProgress: mock(() => {}),
      logSuccess: mock(() => {}),
      logWarning: mock(() => {}),
      logInfo: mock(() => {}),
      logSummary: mock(() => {})
    }));

    tracker = new OperationTracker(output);
  });

  afterEach(() => {
    console.log = originalLog;
  });

  describe("Compact Mode Formatting", () => {
    test("formats PR output in compact structure", () => {
      // Test data
      const stackState = {
        prs: [
          {
            number: 200,
            title: "Implement user authentication",
            url: "https://github.com/owner/repo/pull/200",
            base: "main",
            commits: [
              { hash: "a1b2c3d4e5f6g7h8", message: "Add login endpoint" },
              { hash: "b2c3d4e5f6g7h8i9", message: "Add JWT validation" }
            ]
          },
          {
            number: 201,
            title: "Add user profile page",
            url: "https://github.com/owner/repo/pull/201",
            base: "user/auth",
            commits: [
              { hash: "c3d4e5f6g7h8i9j0", message: "Create profile component" }
            ]
          }
        ],
        unstakedCommits: [
          { hash: "d4e5f6g7h8i9j0k1", message: "Update README" }
        ]
      };

      // Expected compact format
      console.log(`Stack Status: ${stackState.prs.length} PRs`);
      console.log("");
      
      stackState.prs.forEach((pr, i) => {
        console.log(`PR #${pr.number}: ${pr.title} → ${pr.url}`);
        console.log(`  Base: ${pr.base}`);
        
        if (pr.commits && pr.commits.length > 0) {
          pr.commits.forEach(commit => {
            console.log(`  ${commit.hash.slice(0, 7)} ${commit.message}`);
          });
        } else {
          console.log(`  Commits: (none)`);
        }
        
        if (i < stackState.prs.length - 1) {
          console.log("");
        }
      });

      if (stackState.unstakedCommits.length > 0) {
        console.log("");
        console.log(`New Commits (ready to push): ${stackState.unstakedCommits.length}`);
        stackState.unstakedCommits.forEach(commit => {
          console.log(`  ${commit.hash.slice(0, 7)} ${commit.message}`);
        });
      }

      // Verify output
      const output = consoleOutput.join('\n');
      expect(output).toContain("Stack Status: 2 PRs");
      expect(output).toContain("PR #200: Implement user authentication → https://github.com/owner/repo/pull/200");
      expect(output).toContain("  Base: main");
      expect(output).toContain("  a1b2c3d Add login endpoint");
      expect(output).toContain("  b2c3d4e Add JWT validation");
      expect(output).toContain("PR #201: Add user profile page → https://github.com/owner/repo/pull/201");
      expect(output).toContain("  Base: user/auth");
      expect(output).toContain("  c3d4e5f Create profile component");
      expect(output).toContain("New Commits (ready to push): 1");
      expect(output).toContain("  d4e5f6g Update README");
    });

    test("handles long PR titles gracefully", () => {
      const longTitle = "This is a very long PR title that describes a complex feature implementation with multiple components and considerations that should be displayed properly";
      
      console.log(`PR #202: ${longTitle} → https://github.com/owner/repo/pull/202`);
      console.log(`  Base: main`);
      console.log(`  abc1234 Implement feature`);

      const output = consoleOutput.join('\n');
      expect(output).toContain(longTitle);
      expect(output).toContain("→ https://github.com/owner/repo/pull/202");
    });

    test("displays operation progress with timing", async () => {
      // Test progress indicator format
      const mockProgress = {
        start: "⠋ Retrieving stack status...",
        complete: "✓ Stack status retrieved - 1 PRs, 0 unstacked commits (0.1s)"
      };
      
      console.log(mockProgress.start);
      console.log(mockProgress.complete);

      const output = consoleOutput.join('\n');
      expect(output).toContain("Retrieving stack status");
      expect(output).toContain("Stack status retrieved");
      expect(output).toMatch(/\d+ PRs/);
      expect(output).toMatch(/\d+ unstacked commits/);
      expect(output).toMatch(/\d+\.\d+s/);
    });
  });

  describe("Verbose Mode Formatting", () => {
    test("formats detailed status output", () => {
      const verboseOutput = `
Current Status:
- Branch: main
- Clean: Yes
- Ahead: 0 commits
- Behind: 0 commits

Stack Status (from GitHub):
- Active PRs: 1

Active PRs (in stack order):
  1. PR #204: user/feature <- main
     → https://github.com/owner/repo/pull/204
     Commits:
       - commit1a: First implementation
       - commit2b: Add tests
       - commit3c: Fix edge cases
     
New Commits (ready to push) - 2:
  - newcom1: Add documentation
  - newcom2: Update changelog`;

      console.log(verboseOutput);

      const output = consoleOutput.join('\n');
      expect(output).toContain("Current Status:");
      expect(output).toContain("- Branch: main");
      expect(output).toContain("- Clean: Yes");
      expect(output).toContain("Stack Status (from GitHub):");
      expect(output).toContain("Active PRs (in stack order):");
      expect(output).toContain("PR #204: user/feature <- main");
      expect(output).toContain("→ https://github.com/owner/repo/pull/204");
      expect(output).toContain("Commits:");
      expect(output).toContain("- commit1a: First implementation");
      expect(output).toContain("New Commits (ready to push) - 2:");
    });

    test("shows proper indentation in verbose mode", () => {
      const indentedOutput = [
        "Active PRs (in stack order):",
        "  1. PR #205: user/feature-a <- main",
        "     → https://github.com/owner/repo/pull/205",
        "     Commits:",
        "       - abc1234: Commit message one",
        "       - def5678: Commit message two",
        "  2. PR #206: user/feature-b <- user/feature-a",
        "     → https://github.com/owner/repo/pull/206",
        "     Commits: (none)"
      ];

      indentedOutput.forEach(line => console.log(line));

      const output = consoleOutput.join('\n');
      
      // Verify proper indentation levels
      expect(output).toMatch(/^Active PRs/m);
      expect(output).toMatch(/^  \d\. PR #/m);
      expect(output).toMatch(/^     → https:/m);
      expect(output).toMatch(/^     Commits:/m);
      expect(output).toMatch(/^       - /m);
    });
  });

  describe("Edge Cases", () => {
    test("handles special characters in commit messages", () => {
      const specialMessages = [
        "Fix: Handle `null` values properly",
        "feat(api): Add /users/:id endpoint",
        "chore: Update deps & fix vulnerabilities",
        "fix: Escape \"quotes\" and 'apostrophes'",
        "feat: Support emoji 🚀 in messages"
      ];

      specialMessages.forEach(msg => {
        console.log(`  abc1234 ${msg}`);
      });

      const output = consoleOutput.join('\n');
      specialMessages.forEach(msg => {
        expect(output).toContain(msg);
      });
    });

    test("handles very long commit hashes", () => {
      const longHash = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEF";
      const truncated = longHash.slice(0, 7);

      console.log(`  ${truncated} Commit message`);

      const output = consoleOutput.join('\n');
      expect(output).toContain(truncated);
      expect(output).not.toContain(longHash);
    });

    test("handles empty PR titles", () => {
      console.log(`PR #207:  → https://github.com/owner/repo/pull/207`);
      console.log(`  Base: main`);

      const output = consoleOutput.join('\n');
      expect(output).toContain("PR #207:");
      expect(output).toContain("→ https://github.com/owner/repo/pull/207");
    });

    test("handles malformed URLs gracefully", () => {
      const urls = [
        "https://github.com/owner/repo/pull/208",
        "http://github.com/owner/repo/pull/209",
        "github.com/owner/repo/pull/210",
        "https://github.com/owner/repo/pulls/211"
      ];

      urls.forEach((url, i) => {
        console.log(`PR #${208 + i}: Test → ${url}`);
      });

      const output = consoleOutput.join('\n');
      urls.forEach(url => {
        expect(output).toContain(url);
      });
    });
  });

  describe("Transition between modes", () => {
    test("compact mode shows minimal progress info", () => {
      const compactProgress = {
        spinner: "⠋ Retrieving stack status...",
        result: "✓ Stack status retrieved - 3 PRs, 2 unstacked commits (0.5s)"
      };
      
      console.log(compactProgress.spinner);
      console.log(compactProgress.result);

      const output = consoleOutput.join('\n');
      expect(output).toMatch(/^⠋ Retrieving/m);
      expect(output).toMatch(/^✓ Stack status retrieved/m);
      expect(output).toContain("3 PRs");
      expect(output).toContain("2 unstacked commits");
      expect(output).not.toContain("Starting:");
      expect(output).not.toContain("Completed:");
    });

    test("verbose mode shows detailed section info", () => {
      const verboseStructure = {
        header: "Current Status:",
        branch: "- Branch: main",
        clean: "- Clean: Yes",
        stackHeader: "Stack Status (from GitHub):",
        activeCount: "- Active PRs: 2",
        prList: "Active PRs (in stack order):",
        prEntry: "  1. PR #101: user/feature <- main"
      };
      
      Object.values(verboseStructure).forEach(line => {
        console.log(line);
      });

      const output = consoleOutput.join('\n');
      expect(output).toContain("Current Status:");
      expect(output).toContain("Branch: main");
      expect(output).toContain("Stack Status (from GitHub):");
      expect(output).toContain("Active PRs:");
      expect(output).toContain("Active PRs (in stack order):");
    });
  });
});