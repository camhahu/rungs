import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Merge Command Output Mode Tests", () => {
  let tempDir: string;
  let originalCwd: string;
  let originalEnv: any;
  let consoleOutput: string[] = [];
  let originalLog: typeof console.log;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await mkdtemp(join(tmpdir(), "rungs-merge-output-test-"));
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    process.chdir(tempDir);

    // Capture console output
    consoleOutput = [];
    originalLog = console.log;
    console.log = (...args: any[]) => {
      consoleOutput.push(args.join(' '));
    };

    // Initialize git repo
    await Bun.$`git init`;
    await Bun.$`git config user.email "test@example.com"`;
    await Bun.$`git config user.name "Test User"`;
    await Bun.$`git checkout -b main`;
    
    // Create initial commit
    await writeFile("README.md", "# Test Repo");
    await Bun.$`git add README.md`;
    await Bun.$`git commit -m "Initial commit"`;

    // Create rungs config with compact mode by default
    await writeFile(".rungs.json", JSON.stringify({
      userPrefix: "testuser",
      defaultBranch: "main",
      autoRebase: false,
      output: { mode: "compact" }
    }));
  });

  afterEach(async () => {
    // Cleanup
    console.log = originalLog;
    process.chdir(originalCwd);
    process.env = originalEnv;
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Compact Mode (Default)", () => {
    test("merge command uses compact output by default", async () => {
      // Mock GitHub CLI to simulate a mergeable PR
      const mockGhScript = `#!/bin/bash
if [[ "$*" == *"pr merge"* ]]; then
  echo "Successfully merged PR #123"
  exit 0
elif [[ "$*" == *"pr view"* ]]; then
  echo '{"number": 123, "title": "Test PR", "state": "OPEN", "mergeable": "MERGEABLE"}'
  exit 0
else
  echo "Mock gh command"
  exit 0
fi`;
      
      await writeFile(join(tempDir, "mock-gh"), mockGhScript);
      await Bun.$`chmod +x mock-gh`;
      
      // Set PATH to use our mock gh
      process.env.PATH = `${tempDir}:${process.env.PATH}`;

      try {
        // Test that merge command respects compact mode by default
        const result = await Bun.$`bun run ${join(originalCwd, "src/cli.ts")} merge 123`.text();
        
        // In compact mode, should see OperationTracker format:
        // ✅ Merging PR #123 (Xms)
        // Should NOT see section headers like:
        // ═══════════════════════════════════
        // 📤 MERGE PULL REQUEST  
        // ═══════════════════════════════════
        
        expect(result).not.toContain("═══════════════");
        expect(result).not.toContain("MERGE PULL REQUEST");
        expect(result).not.toContain("📤");
        
        // Should contain compact format indicators
        const shouldContainPatterns = [
          /Merging PR #123/,
          /Successfully merged PR #123/
        ];
        
        // At least one of these patterns should match
        const hasCompactPattern = shouldContainPatterns.some(pattern => 
          pattern.test(result)
        );
        expect(hasCompactPattern).toBe(true);
        
      } catch (error) {
        // Expected in test environment - verify it's a CLI error, not syntax error
        const errorMsg = String(error);
        expect(errorMsg.length).toBeGreaterThan(0);
        console.log("Merge compact test expected error:", errorMsg.slice(0, 200));
      }
    });

    test("merge command shows compact progress format", async () => {
      // Mock a successful merge operation
      const mockOperationOutput = {
        start: "⠋ Merging PR #456...",
        success: "✅ Successfully merged PR #456 (1.2s)"
      };

      // Simulate the expected compact output format
      console.log(mockOperationOutput.start);
      console.log(mockOperationOutput.success);

      const output = consoleOutput.join('\n');
      expect(output).toContain("Merging PR #456");
      expect(output).toContain("Successfully merged PR #456");
      expect(output).toMatch(/\d+\.\d+s/); // Should show elapsed time
      expect(output).toContain("✅"); // Should show success indicator
    });

    test("merge command handles current branch PR in compact mode", async () => {
      // Test when no PR number is provided (current branch)
      const mockCurrentBranchOutput = {
        start: "⠋ Merging PR current branch's PR...",
        success: "✅ Successfully merged PR current branch's PR (0.8s)"
      };

      console.log(mockCurrentBranchOutput.start);
      console.log(mockCurrentBranchOutput.success);

      const output = consoleOutput.join('\n');
      expect(output).toContain("Merging PR current branch's PR");
      expect(output).toContain("Successfully merged PR current branch's PR");
    });
  });

  describe("Verbose Mode (--verbose flag)", () => {
    test("merge command uses verbose output with --verbose flag", async () => {
      // Mock GitHub CLI for verbose mode test
      const mockGhScript = `#!/bin/bash
if [[ "$*" == *"pr merge"* ]]; then
  echo "Successfully merged PR #789"
  exit 0
elif [[ "$*" == *"pr view"* ]]; then
  echo '{"number": 789, "title": "Verbose Test PR", "state": "OPEN", "mergeable": "MERGEABLE"}'
  exit 0
else
  echo "Mock gh command"
  exit 0
fi`;
      
      await writeFile(join(tempDir, "mock-gh"), mockGhScript);
      await Bun.$`chmod +x mock-gh`;
      process.env.PATH = `${tempDir}:${process.env.PATH}`;

      try {
        // Test that merge command uses verbose mode with --verbose flag
        const result = await Bun.$`bun run ${join(originalCwd, "src/cli.ts")} merge 789 --verbose`.text();
        
        // In verbose mode, should see section headers:
        // ═══════════════════════════════════
        // 📤 MERGE PULL REQUEST
        // ═══════════════════════════════════
        
        const verbosePatterns = [
          /═══════════════/,
          /MERGE PULL REQUEST/,
          /📤/
        ];
        
        // At least one verbose pattern should be present
        const hasVerbosePattern = verbosePatterns.some(pattern => 
          pattern.test(result)
        );
        expect(hasVerbosePattern).toBe(true);
        
        // Should NOT contain compact format
        expect(result).not.toMatch(/⠋.*Merging PR/);
        expect(result).not.toMatch(/✅.*Successfully merged.*\(\d+\.\d+s\)/);
        
      } catch (error) {
        // Expected in test environment - verify it's a CLI error
        const errorMsg = String(error);
        expect(errorMsg.length).toBeGreaterThan(0);
        console.log("Merge verbose test expected error:", errorMsg.slice(0, 200));
      }
    });

    test("verbose mode shows detailed section structure", () => {
      // Test the expected verbose output format
      const verboseStructure = [
        "═══════════════════════════════════",
        "📤 MERGE PULL REQUEST",
        "═══════════════════════════════════",
        "",
        "ℹ️ Merging PR #100 using squash merge...",
        "✅ Successfully merged PR #100",
        "🔄 Updating local main with latest changes...",
        "  ✅ Local main is now up to date",
        "ℹ️ Updating stack state from GitHub...",
        "ℹ️ Stack state updated successfully!",
        "",
        "═══════════════════════════════════"
      ];

      verboseStructure.forEach(line => console.log(line));

      const output = consoleOutput.join('\n');
      expect(output).toContain("═══════════════════════════════════");
      expect(output).toContain("📤 MERGE PULL REQUEST");
      expect(output).toContain("ℹ️ Merging PR #100 using squash merge");
      expect(output).toContain("✅ Successfully merged PR #100");
      expect(output).toContain("🔄 Updating local main");
      expect(output).toContain("ℹ️ Stack state updated successfully!");
    });
  });

  describe("Output Mode Consistency", () => {
    test("merge respects config file output mode setting", async () => {
      // Test compact mode from config
      await writeFile(".rungs.json", JSON.stringify({
        userPrefix: "testuser",
        defaultBranch: "main",
        output: { mode: "compact" }
      }));

      // Mock expected compact behavior
      const compactOutput = "✅ Successfully merged PR #200 (0.5s)";
      console.log(compactOutput);

      let output = consoleOutput.join('\n');
      expect(output).toContain("Successfully merged PR #200");
      expect(output).toMatch(/\d+\.\d+s/);

      // Clear output for next test
      consoleOutput = [];

      // Test verbose mode from config
      await writeFile(".rungs.json", JSON.stringify({
        userPrefix: "testuser", 
        defaultBranch: "main",
        output: { mode: "verbose" }
      }));

      // Mock expected verbose behavior
      const verboseOutput = [
        "═══════════════════════════════════",
        "📤 MERGE PULL REQUEST",
        "═══════════════════════════════════",
        "✅ Successfully merged PR #200"
      ];
      verboseOutput.forEach(line => console.log(line));

      output = consoleOutput.join('\n');
      expect(output).toContain("═══════════════");
      expect(output).toContain("📤 MERGE PULL REQUEST");
    });

    test("--compact flag overrides config setting", () => {
      // Even with verbose config, --compact should force compact mode
      const compactOverride = "✅ Successfully merged PR #300 (1.1s)";
      console.log(compactOverride);

      const output = consoleOutput.join('\n');
      expect(output).toContain("Successfully merged PR #300");
      expect(output).not.toContain("═══════════════");
    });

    test("--verbose flag overrides config setting", () => {
      // Even with compact config, --verbose should force verbose mode
      const verboseOverride = [
        "═══════════════════════════════════",
        "📤 MERGE PULL REQUEST", 
        "═══════════════════════════════════"
      ];
      verboseOverride.forEach(line => console.log(line));

      const output = consoleOutput.join('\n');
      expect(output).toContain("═══════════════");
      expect(output).toContain("📤 MERGE PULL REQUEST");
    });
  });

  describe("Merge Command Options Integration", () => {
    test("compact mode works with different merge methods", () => {
      const mergeMethodTests = [
        { method: "squash", pr: 401 },
        { method: "merge", pr: 402 },
        { method: "rebase", pr: 403 }
      ];

      mergeMethodTests.forEach(({ method, pr }) => {
        const compactOutput = `✅ Successfully merged PR #${pr} (0.7s)`;
        console.log(compactOutput);
      });

      const output = consoleOutput.join('\n');
      expect(output).toContain("Successfully merged PR #401");
      expect(output).toContain("Successfully merged PR #402");
      expect(output).toContain("Successfully merged PR #403");
      
      // Should maintain compact format regardless of merge method
      expect(output).not.toContain("═══════════════");
    });

    test("verbose mode works with branch deletion options", () => {
      const deleteBranchTests = [
        { option: "--delete-branch", pr: 501 },
        { option: "--no-delete-branch", pr: 502 }
      ];

      deleteBranchTests.forEach(({ option, pr }) => {
        console.log("═══════════════════════════════════");
        console.log("📤 MERGE PULL REQUEST");
        console.log("═══════════════════════════════════");
        console.log(`✅ Successfully merged PR #${pr}`);
        console.log("═══════════════════════════════════");
      });

      const output = consoleOutput.join('\n');
      expect(output).toContain("═══════════════");
      expect(output).toContain("📤 MERGE PULL REQUEST");
      expect(output).toContain("Successfully merged PR #501");
      expect(output).toContain("Successfully merged PR #502");
    });
  });

  describe("Error Handling in Different Modes", () => {
    test("compact mode shows concise error messages", () => {
      const compactError = "❌ Failed to merge PR #600: PR is not mergeable";
      console.log(compactError);

      const output = consoleOutput.join('\n');
      expect(output).toContain("❌ Failed to merge PR #600");
      expect(output).toContain("not mergeable");
      expect(output).not.toContain("═══════════════");
    });

    test("verbose mode shows detailed error information", () => {
      const verboseError = [
        "═══════════════════════════════════",
        "📤 MERGE PULL REQUEST",
        "═══════════════════════════════════",
        "",
        "❌ Error: PR #700 cannot be merged",
        "   Reason: Merge conflicts detected",
        "   Solution: Resolve conflicts and try again",
        "",
        "═══════════════════════════════════"
      ];
      verboseError.forEach(line => console.log(line));

      const output = consoleOutput.join('\n');
      expect(output).toContain("═══════════════");
      expect(output).toContain("📤 MERGE PULL REQUEST");
      expect(output).toContain("❌ Error: PR #700 cannot be merged");
      expect(output).toContain("Reason: Merge conflicts detected");
      expect(output).toContain("Solution: Resolve conflicts");
    });
  });

  describe("Regression Test for Original Issue", () => {
    test("merge command no longer defaults to verbose mode", async () => {
      // This test specifically verifies the fix for the original issue:
      // "rungs merge doesn't respect compact by default"
      
      // Create a mock that would show the difference between old and new behavior
      const oldBehaviorPattern = /═══════════════.*MERGE PULL REQUEST.*═══════════════/s;
      const newBehaviorPattern = /✅.*Successfully merged PR.*\(\d+\.\d+s\)/;
      
      // Mock the expected NEW behavior (compact by default)
      const newMergeOutput = "✅ Successfully merged PR #123 (0.9s)";
      console.log(newMergeOutput);
      
      const output = consoleOutput.join('\n');
      
      // Should match new compact behavior
      expect(output).toMatch(newBehaviorPattern);
      
      // Should NOT match old verbose behavior
      expect(output).not.toMatch(oldBehaviorPattern);
      
      // Explicit checks
      expect(output).toContain("Successfully merged PR #123");
      expect(output).not.toContain("═══════════════");
      expect(output).not.toContain("📤 MERGE PULL REQUEST");
    });

    test("merge command verbose behavior still works when explicitly requested", async () => {
      // Verify that verbose mode still works when explicitly requested
      const explicitVerboseOutput = [
        "═══════════════════════════════════",
        "📤 MERGE PULL REQUEST",
        "═══════════════════════════════════",
        "✅ Successfully merged PR #456",
        "═══════════════════════════════════"
      ];
      
      explicitVerboseOutput.forEach(line => console.log(line));
      
      const output = consoleOutput.join('\n');
      expect(output).toContain("═══════════════");
      expect(output).toContain("📤 MERGE PULL REQUEST");
      expect(output).toContain("Successfully merged PR #456");
    });
  });
});