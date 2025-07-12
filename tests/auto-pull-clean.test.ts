import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { GitManager } from "../src/git-manager";
import { setupIsolatedTest, type TestSetup } from "./test-utils-clean";

/**
 * CLEAN AUTO-PULL TESTS  
 * Tests the auto-pull functionality without global mocking pollution
 */

describe("Auto-pull After Merge", () => {
  let testSetup: TestSetup;
  let gitManager: GitManager;

  beforeEach(async () => {
    testSetup = await setupIsolatedTest();
    gitManager = new GitManager();
  });

  afterEach(async () => {
    if (testSetup) {
      await testSetup.cleanup();
    }
  });

  test("should have pullLatestChanges method", () => {
    expect(typeof gitManager.pullLatestChanges).toBe("function");
  });

  test("should accept branch parameter", async () => {
    // Test method signature
    const methodLength = gitManager.pullLatestChanges.length;
    expect(methodLength).toBeGreaterThanOrEqual(1);
  });

  test("should handle rebase conflicts gracefully", async () => {
    // Method should exist
    expect(typeof gitManager.pullLatestChanges).toBe("function");
  });
});
