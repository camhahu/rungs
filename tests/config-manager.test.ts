import { test, expect, beforeEach, afterEach } from "bun:test";
import { ConfigManager } from "../src/config-manager";
import { unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("ConfigManager", () => {
  let tempDir: string;
  let configManager: ConfigManager;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `rungs-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    const configPath = join(tempDir, "config.json");
    configManager = new ConfigManager(configPath);
  });

  afterEach(async () => {
    try {
      await Bun.$`rm -rf ${tempDir}`;
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should return default config when no file exists", async () => {
    const config = await configManager.getAll();
    
    expect(config.userPrefix).toBe("dev");
    expect(config.defaultBranch).toBe("main");
    expect(config.draftPRs).toBe(true);
    expect(config.autoRebase).toBe(true);
    expect(config.branchNaming).toBe("commit-message");
  });

  test("should set and get individual config values", async () => {
    await configManager.set("userPrefix", "john");
    const userPrefix = await configManager.get("userPrefix");
    
    expect(userPrefix).toBe("john");
  });

  test("should persist config to file", async () => {
    await configManager.set("userPrefix", "alice");
    await configManager.set("defaultBranch", "develop");
    
    // Create new instance to test persistence
    const newConfigManager = new ConfigManager(configManager["configPath"]);
    const config = await newConfigManager.getAll();
    
    expect(config.userPrefix).toBe("alice");
    expect(config.defaultBranch).toBe("develop");
  });

  test("should update multiple config values", async () => {
    await configManager.update({
      userPrefix: "bob",
      draftPRs: false,
      autoRebase: false
    });
    
    const config = await configManager.getAll();
    expect(config.userPrefix).toBe("bob");
    expect(config.draftPRs).toBe(false);
    expect(config.autoRebase).toBe(false);
    expect(config.defaultBranch).toBe("main"); // Should remain default
  });

  test("should reset to defaults", async () => {
    await configManager.set("userPrefix", "custom");
    await configManager.set("draftPRs", false);
    
    await configManager.reset();
    
    const config = await configManager.getAll();
    expect(config.userPrefix).toBe("dev");
    expect(config.draftPRs).toBe(true);
  });

  test("should handle invalid JSON gracefully", async () => {
    // Write invalid JSON to config file
    await Bun.write(configManager["configPath"], "invalid json");
    
    const config = await configManager.getAll();
    expect(config.userPrefix).toBe("dev"); // Should return defaults
  });
});
