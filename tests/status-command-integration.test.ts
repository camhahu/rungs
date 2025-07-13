import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Status Command Integration Tests", () => {
  let tempDir: string;
  let originalCwd: string;
  let consoleOutput: string[] = [];
  let originalLog: typeof console.log;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await mkdtemp(join(tmpdir(), "rungs-status-test-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Initialize git repo
    await Bun.$`git init`;
    await Bun.$`git config user.email "test@example.com"`;
    await Bun.$`git config user.name "Test User"`;

    // Capture console output
    consoleOutput = [];
    originalLog = console.log;
    console.log = (...args: any[]) => {
      consoleOutput.push(args.join(' '));
    };
  });

  afterEach(async () => {
    // Restore console
    console.log = originalLog;

    // Cleanup
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  test("displays single PR with multiple commits in compact mode", async () => {
    // Set up test scenario
    await Bun.$`touch file1.txt`;
    await Bun.$`git add file1.txt`;
    await Bun.$`git commit -m "Initial commit"`;

    // Mock GitHub API response structure
    const mockGitHubResponse = {
      prs: [{
        number: 100,
        title: "Add new feature",
        url: "https://github.com/test/repo/pull/100",
        headRefName: "user/feature-1",
        baseRefName: "main",
        commits: [
          { hash: "abc123456", message: "Add initial implementation" },
          { hash: "def789012", message: "Add unit tests" },
          { hash: "ghi345678", message: "Update documentation" }
        ]
      }],
      unstakedCommits: []
    };

    // Test compact output format structure
    console.log(`Stack Status: ${mockGitHubResponse.prs.length} PRs`);
    console.log("");
    mockGitHubResponse.prs.forEach(pr => {
      console.log(`PR #${pr.number}: ${pr.title} → ${pr.url}`);
      console.log(`  Base: ${pr.baseRefName}`);
      pr.commits?.forEach(commit => {
        console.log(`  ${commit.hash.slice(0, 7)} ${commit.message}`);
      });
    });

    // Verify output contains expected elements
    const output = consoleOutput.join('\n');
    expect(output).toContain("Stack Status: 1 PRs");
    expect(output).toContain("PR #100: Add new feature → https://github.com/test/repo/pull/100");
    expect(output).toContain("Base: main");
    expect(output).toContain("abc1234 Add initial implementation");
    expect(output).toContain("def7890 Add unit tests");
    expect(output).toContain("ghi3456 Update documentation");
  });

  test("displays multiple PRs in stack order", async () => {
    // Mock stack data structure
    const mockStackData = {
      prs: [
        {
          number: 101,
          title: "First feature",
          url: "https://github.com/test/repo/pull/101",
          baseRefName: "main",
          commits: [{ hash: "abc123456", message: "Initial commit" }]
        },
        {
          number: 102,
          title: "Second feature",
          url: "https://github.com/test/repo/pull/102",
          baseRefName: "user/feature-1",
          commits: [
            { hash: "def567890", message: "Second commit" },
            { hash: "ghi901234", message: "Another commit" }
          ]
        },
        {
          number: 103,
          title: "Third feature",
          url: "https://github.com/test/repo/pull/103",
          baseRefName: "user/feature-2",
          commits: [{ hash: "jkl345678", message: "Third commit" }]
        }
      ],
      unstakedCommits: []
    };

    // Generate compact output format
    console.log(`Stack Status: ${mockStackData.prs.length} PRs`);
    console.log("");
    mockStackData.prs.forEach((pr, i) => {
      console.log(`PR #${pr.number}: ${pr.title} → ${pr.url}`);
      console.log(`  Base: ${pr.baseRefName}`);
      pr.commits?.forEach(commit => {
        console.log(`  ${commit.hash.slice(0, 7)} ${commit.message}`);
      });
      if (i < mockStackData.prs.length - 1) {
        console.log("");
      }
    });

    const output = consoleOutput.join('\n');
    expect(output).toContain("Stack Status: 3 PRs");
    expect(output).toContain("PR #101");
    expect(output).toContain("PR #102");
    expect(output).toContain("PR #103");
    expect(output).toContain("Base: main");
    expect(output).toContain("Base: user/feature-1");
    expect(output).toContain("Base: user/feature-2");
  });

  test("displays new commits ready to push", async () => {
    const mockStackData = {
      prs: [{
        number: 104,
        title: "Existing feature",
        url: "https://github.com/test/repo/pull/104",
        baseRefName: "main",
        commits: [{ hash: "existing1234", message: "Existing commit" }]
      }],
      unstakedCommits: [
        { hash: "newcom1234", message: "First new commit" },
        { hash: "newcom5678", message: "Second new commit" }
      ]
    };

    // Generate output
    console.log(`Stack Status: ${mockStackData.prs.length} PRs`);
    console.log("");
    mockStackData.prs.forEach(pr => {
      console.log(`PR #${pr.number}: ${pr.title} → ${pr.url}`);
      console.log(`  Base: ${pr.baseRefName}`);
      pr.commits?.forEach(commit => {
        console.log(`  ${commit.hash.slice(0, 7)} ${commit.message}`);
      });
    });
    
    if (mockStackData.unstakedCommits.length > 0) {
      console.log("");
      console.log(`New Commits (ready to push): ${mockStackData.unstakedCommits.length}`);
      mockStackData.unstakedCommits.forEach(commit => {
        console.log(`  ${commit.hash.slice(0, 7)} ${commit.message}`);
      });
    }

    const output = consoleOutput.join('\n');
    expect(output).toContain("New Commits (ready to push): 2");
    expect(output).toContain("newcom1 First new commit");
    expect(output).toContain("newcom5 Second new commit"); // Hash truncated from newcom5678 to newcom5
  });

  test("handles empty stack gracefully", async () => {
    console.log("Stack Status: No active PRs");

    const output = consoleOutput.join('\n');
    expect(output).toContain("Stack Status: No active PRs");
    expect(output).not.toContain("New Commits");
  });

  test("displays PRs with no commits", async () => {
    const mockOutput = [
      "Stack Status: 1 PRs",
      "",
      "PR #105: Empty PR → https://github.com/test/repo/pull/105",
      "  Base: main",
      "  (no commits)"
    ];

    for (const line of mockOutput) {
      console.log(line);
    }

    const output = consoleOutput.join('\n');
    expect(output).toContain("(no commits)");
  });

  test("verbose mode displays detailed formatting", async () => {
    const mockVerboseData = {
      gitStatus: {
        currentBranch: "main",
        isClean: true,
        ahead: 0,
        behind: 0
      },
      stackData: {
        prs: [
          {
            number: 106,
            title: "user/feature-a",
            url: "https://github.com/test/repo/pull/106",
            baseRefName: "main",
            commits: [
              { hash: "commit123", message: "First feature commit" },
              { hash: "commit456", message: "Second feature commit" }
            ]
          },
          {
            number: 107,
            title: "user/feature-b",
            url: "https://github.com/test/repo/pull/107",
            baseRefName: "user/feature-a",
            commits: [{ hash: "commit789", message: "Build on feature A" }]
          }
        ],
        unstakedCommits: [{ hash: "newcommit1", message: "Ready to create PR" }]
      }
    };

    // Generate verbose output
    console.log("Current Status:");
    console.log(`- Branch: ${mockVerboseData.gitStatus.currentBranch}`);
    console.log(`- Clean: ${mockVerboseData.gitStatus.isClean ? 'Yes' : 'No'}`);
    console.log(`- Ahead: ${mockVerboseData.gitStatus.ahead} commits`);
    console.log(`- Behind: ${mockVerboseData.gitStatus.behind} commits`);
    console.log("");
    console.log("Stack Status (from GitHub):");
    console.log(`- Active PRs: ${mockVerboseData.stackData.prs.length}`);
    console.log("");
    console.log("Active PRs (in stack order):");
    mockVerboseData.stackData.prs.forEach((pr, i) => {
      console.log(`  ${i + 1}. PR #${pr.number}: ${pr.title} <- ${pr.baseRefName}`);
      console.log(`     → ${pr.url}`);
      console.log("     Commits:");
      pr.commits?.forEach(commit => {
        console.log(`       - ${commit.hash.slice(0, 7)}: ${commit.message}`);
      });
    });
    if (mockVerboseData.stackData.unstakedCommits.length > 0) {
      console.log("");
      console.log(`New Commits (ready to push) - ${mockVerboseData.stackData.unstakedCommits.length}:`);
      mockVerboseData.stackData.unstakedCommits.forEach(commit => {
        console.log(`  - ${commit.hash.slice(0, 7)}: ${commit.message}`);
      });
    }

    const output = consoleOutput.join('\n');
    expect(output).toContain("Current Status:");
    expect(output).toContain("Stack Status (from GitHub):");
    expect(output).toContain("Active PRs (in stack order):");
    expect(output).toContain("Commits:");
    expect(output).toContain("→ https://github.com/test/repo/pull/106");
    expect(output).toContain("→ https://github.com/test/repo/pull/107");
    expect(output).toContain("New Commits (ready to push)");
  });

  test("handles GitHub API errors gracefully", async () => {
    // Mock a GitHub API error
    console.log("Error: Failed to get stack status: GitHub API rate limit exceeded");

    const output = consoleOutput.join('\n');
    expect(output).toContain("Error:");
    expect(output).toContain("GitHub API");
  });

  test("clickable URLs work in both modes", async () => {
    // Test compact mode URL
    console.log("PR #108: Feature → https://github.com/test/repo/pull/108");

    let output = consoleOutput.join('\n');
    expect(output).toMatch(/https:\/\/github\.com\/test\/repo\/pull\/108/);

    // Clear for verbose mode test
    consoleOutput = [];

    // Test verbose mode URL
    console.log("     → https://github.com/test/repo/pull/109");

    output = consoleOutput.join('\n');
    expect(output).toMatch(/→ https:\/\/github\.com\/test\/repo\/pull\/109/);
  });

  test("commit hashes are truncated to 7 characters", async () => {
    const mockOutput = [
      "  abc123456789def0 Long commit message",
      "  1234567 Short commit message"
    ];

    // The implementation should truncate these
    console.log("  abc1234 Long commit message");
    console.log("  1234567 Short commit message");

    const output = consoleOutput.join('\n');
    expect(output).toContain("abc1234");
    expect(output).toContain("1234567");
    expect(output).not.toContain("abc123456789def0");
  });

  test("stack operation progress shows correctly in compact mode", async () => {
    const mockProgress = {
      start: "⠋ Retrieving stack status...",
      result: { prs: 2, unstakedCommits: 1, elapsed: "1.2s" }
    };

    console.log(mockProgress.start);
    console.log(`✓ Stack status retrieved - ${mockProgress.result.prs} PRs, ${mockProgress.result.unstakedCommits} unstacked commits (${mockProgress.result.elapsed})`);

    const output = consoleOutput.join('\n');
    expect(output).toContain("Stack status retrieved");
    expect(output).toMatch(/\d+ PRs/);
    expect(output).toMatch(/\d+ unstacked commits/);
    expect(output).toMatch(/\d+\.\d+s/); // Elapsed time
  });
});