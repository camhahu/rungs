/**
 * CLEAN test utilities with NO global mocking pollution
 * This replaces the old version that caused "text is not a function" errors
 */

import { randomBytes } from "crypto";
import path from "path";

export interface TestSetup {
  tempDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Create isolated test environment with temp directory
 * Uses child_process instead of corrupted Bun.$ for setup
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
 * DEPRECATED: setupTempGitRepo with global mocking
 * Use setupIsolatedTest instead
 */
export async function setupTempGitRepo(): Promise<string> {
  console.warn("setupTempGitRepo is deprecated, use setupIsolatedTest instead");
  const testSetup = await setupIsolatedTest();
  return testSetup.tempDir;
}

/**
 * DEPRECATED: cleanupTempDir 
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  console.warn("cleanupTempDir is deprecated, use TestSetup.cleanup instead");
  try {
    const { spawn } = require("child_process");
    await new Promise<void>((resolve) => {
      const proc = spawn("rm", ["-rf", tempDir], { stdio: "pipe" });
      proc.on("exit", () => resolve());
      proc.on("error", () => resolve());
    });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * DEPRECATED: All global mocking functions
 * These caused "text is not a function" errors
 */
export function createMockBunShell() {
  console.warn("createMockBunShell is deprecated due to global mocking pollution");
  return {
    mockShell: () => {},
    commandHistory: [],
    restore: () => {},
  };
}

export function createSmartMockBunShell() {
  console.warn("createSmartMockBunShell is deprecated due to global mocking pollution");
  return {
    mockShell: () => {},
    commandHistory: [],
    restore: () => {},
  };
}

export function restoreOriginalBunShell() {
  console.warn("restoreOriginalBunShell is no longer needed - avoid global mocking");
}
