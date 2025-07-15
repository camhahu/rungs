import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigManager } from "../src/config-manager.js";

describe("Config Validation Tests", () => {
  let tempDir: string;
  let configDir: string;
  let configPath: string;
  let originalHome: string;

  beforeEach(async () => {
    // Create temporary directory for test
    tempDir = await mkdtemp(join(tmpdir(), "rungs-config-validation-test-"));
    configDir = join(tempDir, ".config", "rungs");
    configPath = join(configDir, "config.json");
    
    // Mock home directory
    originalHome = process.env.HOME || process.env.USERPROFILE || "";
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;
    
    // Create config directory
    await mkdir(configDir, { recursive: true });
  });

  afterEach(async () => {
    // Restore environment and cleanup
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalHome;
    await rm(tempDir, { recursive: true, force: true });
  });

  test("isUsingDefaults returns true when config file doesn't exist", async () => {
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(true);
    expect(result.defaultBranch).toBe(true);
  });

  test("isUsingDefaults returns true when config file is empty", async () => {
    await writeFile(configPath, "{}");
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(true);
    expect(result.defaultBranch).toBe(true);
  });

  test("isUsingDefaults returns true when config has default values", async () => {
    const configContent = {
      userPrefix: "dev",
      defaultBranch: "main"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(true);
    expect(result.defaultBranch).toBe(true);
  });

  test("isUsingDefaults returns false when userPrefix is customized", async () => {
    const configContent = {
      userPrefix: "john",
      defaultBranch: "main"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(false);
    expect(result.defaultBranch).toBe(true);
  });

  test("isUsingDefaults returns false when defaultBranch is customized", async () => {
    const configContent = {
      userPrefix: "dev",
      defaultBranch: "develop"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(true);
    expect(result.defaultBranch).toBe(false);
  });

  test("isUsingDefaults returns false when both values are customized", async () => {
    const configContent = {
      userPrefix: "alice",
      defaultBranch: "develop"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(false);
    expect(result.defaultBranch).toBe(false);
  });

  test("isUsingDefaults returns false when config has additional properties", async () => {
    const configContent = {
      userPrefix: "bob",
      defaultBranch: "master",
      draftPRs: false,
      autoRebase: false
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(false);
    expect(result.defaultBranch).toBe(false);
  });

  test("isUsingDefaults handles corrupted config file gracefully", async () => {
    await writeFile(configPath, "invalid json {");
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    // Should default to true when config is corrupted
    expect(result.userPrefix).toBe(true);
    expect(result.defaultBranch).toBe(true);
  });

  test("isUsingDefaults handles partial config with only userPrefix", async () => {
    const configContent = {
      userPrefix: "charlie"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(false);
    expect(result.defaultBranch).toBe(true); // Not specified, so using default
  });

  test("isUsingDefaults handles partial config with only defaultBranch", async () => {
    const configContent = {
      defaultBranch: "staging"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(true); // Not specified, so using default
    expect(result.defaultBranch).toBe(false);
  });

  test("config values are properly detected as custom even with extra whitespace", async () => {
    const configContent = {
      userPrefix: "  dave  ",
      defaultBranch: "  release  "
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    const config = new ConfigManager(configPath);
    const result = await config.isUsingDefaults();
    
    // The config manager should detect these as custom values
    expect(result.userPrefix).toBe(false);
    expect(result.defaultBranch).toBe(false);
  });

  test("isUsingDefaults works with custom config path", async () => {
    const customConfigPath = join(tempDir, "custom-config.json");
    const configContent = {
      userPrefix: "custom",
      defaultBranch: "custom-main"
    };
    await writeFile(customConfigPath, JSON.stringify(configContent));
    
    const config = new ConfigManager(customConfigPath);
    const result = await config.isUsingDefaults();
    
    expect(result.userPrefix).toBe(false);
    expect(result.defaultBranch).toBe(false);
  });
});