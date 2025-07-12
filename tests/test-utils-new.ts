import { test, expect } from "bun:test";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs/promises";

/**
 * Test utilities with NO global mocking pollution
 * Uses dependency injection and proper isolation
 */

export interface TestSetup {
  tempDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Create isolated test environment with temp directory
 */
export async function setupIsolatedTest(): Promise<TestSetup> {
  const randomId = randomBytes(8).toString("hex");
  const tempDir = path.join("/tmp", `rungs-test-${Date.now()}-${randomId}`);

  try {
    // Use direct shell command instead of corrupted Bun.$
    const { spawn } = require("child_process");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("mkdir", ["-p", tempDir], { stdio: "pipe" });
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to create test directory: ${tempDir}`));
      });
      proc.on("error", reject);
    });

    return {
      tempDir,
      cleanup: async () => {
        try {
          await new Promise<void>((resolve, reject) => {
            const proc = spawn("rm", ["-rf", tempDir], { stdio: "pipe" });
            proc.on("exit", () => resolve());
            proc.on("error", reject);
          });
        } catch (error) {
          console.warn(`Failed to cleanup test directory: ${tempDir}`, error);
        }
      },
    };
  } catch (error) {
    throw new Error(`setupIsolatedTest failed: ${error}`);
  }
}

/**
 * Setup temp git repository WITHOUT using corrupted Bun.$
 */
export async function setupTempGitRepo(): Promise<string> {
  const testSetup = await setupIsolatedTest();
  const tempDir = testSetup.tempDir;

  try {
    const { spawn } = require("child_process");

    // Helper to run commands without Bun.$
    const runCommand = (cmd: string, args: string[], cwd: string = tempDir): Promise<void> => {
      return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { cwd, stdio: "pipe" });
        proc.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Command failed: ${cmd} ${args.join(" ")}`));
        });
        proc.on("error", reject);
      });
    };

    // Initialize git repo
    await runCommand("git", ["init"]);
    await runCommand("git", ["config", "user.name", "Test User"]);
    await runCommand("git", ["config", "user.email", "test@example.com"]);

    return tempDir;
  } catch (error) {
    await testSetup.cleanup();
    throw new Error(`setupTempGitRepo failed: ${error}`);
  }
}

/**
 * Mock shell executor for dependency injection
 */
export interface MockShellExecutor {
  execute: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

/**
 * Create a mock shell executor that doesn't pollute global state
 */
export function createMockShellExecutor(responses: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>): MockShellExecutor {
  return {
    async execute(command: string) {
      // Normalize command for matching
      const normalizedCmd = command.trim().replace(/\s+/g, " ");
      
      // Find matching response
      for (const [pattern, response] of Object.entries(responses)) {
        if (normalizedCmd.includes(pattern) || normalizedCmd.match(new RegExp(pattern))) {
          return {
            stdout: response.stdout || "",
            stderr: response.stderr || "",
            exitCode: response.exitCode || 0,
          };
        }
      }

      // Default response for unmatched commands
      return {
        stdout: "",
        stderr: `Mock: Command not found: ${command}`,
        exitCode: 1,
      };
    },
  };
}

/**
 * Test helper that creates managers with injected dependencies
 */
export function createTestManagers(mockShell?: MockShellExecutor) {
  // If a mock shell is provided, we can inject it into managers
  // For now, this is a placeholder for dependency injection
  // The actual managers would need to be refactored to accept shell executor
  return {
    // These would be dependency-injected versions
    // gitManager: new GitManager(mockShell),
    // githubManager: new GitHubManager(mockShell),
  };
}

/**
 * Verify that Bun.$ is working correctly
 */
export async function verifyBunShellWorking(): Promise<boolean> {
  try {
    const result = await Bun.$`echo "test"`.text();
    return result.trim() === "test";
  } catch (error) {
    console.error("Bun.$ is corrupted:", error);
    return false;
  }
}

/**
 * Emergency restoration of Bun.$ if needed
 */
export function emergencyRestoreBunShell() {
  // This is a last resort - ideally we shouldn't need this
  try {
    // Re-import Bun to get a fresh reference
    delete require.cache[require.resolve("bun")];
    const bunModule = require("bun");
    (global as any).Bun = bunModule;
    console.log("Emergency restored Bun.$");
  } catch (error) {
    console.error("Failed to emergency restore Bun.$:", error);
  }
}
