import { test, expect } from "bun:test";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs/promises";

/**
 * CLEAN test utilities with NO global mocking pollution
 * Uses proper temp directory creation without shell dependencies
 */

export interface TestSetup {
  tempDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Create isolated test environment with temp directory
 * Uses fs.mkdir instead of shell commands to avoid Bun.$ issues
 */
export async function setupIsolatedTest(): Promise<TestSetup> {
  const randomId = randomBytes(8).toString("hex");
  const tempDir = path.join("/tmp", `rungs-test-${Date.now()}-${randomId}`);

  try {
    // Use fs.mkdir instead of shell commands
    await fs.mkdir(tempDir, { recursive: true });

    return {
      tempDir,
      cleanup: async () => {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
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
 * Setup temp git repository using proper Bun.$ calls
 */
export async function setupTempGitRepo(): Promise<string> {
  const testSetup = await setupIsolatedTest();
  const tempDir = testSetup.tempDir;

  try {
    // Change to temp directory
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    // Initialize git repo using Bun.$
    await Bun.$`git init`;
    await Bun.$`git config user.name "Test User"`;
    await Bun.$`git config user.email "test@example.com"`;

    // Restore original directory
    process.chdir(originalCwd);

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
