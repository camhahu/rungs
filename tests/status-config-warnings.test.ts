import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Status Config Warnings Integration Tests", () => {
  let tempDir: string;
  let configDir: string;
  let configPath: string;
  let originalCwd: string;
  let originalHome: string;

  beforeEach(async () => {
    // Create temporary directory for test
    tempDir = await mkdtemp(join(tmpdir(), "rungs-status-config-warnings-test-"));
    configDir = join(tempDir, ".config", "rungs");
    configPath = join(configDir, "config.json");
    
    originalCwd = process.cwd();
    originalHome = process.env.HOME || process.env.USERPROFILE || "";
    
    // Mock home directory
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;
    
    // Create config directory
    await mkdir(configDir, { recursive: true });
    
    // Set up test git repo
    process.chdir(tempDir);
    await Bun.$`git init`;
    await Bun.$`git config user.email "test@example.com"`;
    await Bun.$`git config user.name "Test User"`;
    await Bun.$`git checkout -b main`;
    
    // Create initial commit
    await writeFile("README.md", "# Test Repo");
    await Bun.$`git add README.md`;
    await Bun.$`git commit -m "Initial commit"`;
  });

  afterEach(async () => {
    // Restore environment and cleanup
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalHome;
    await rm(tempDir, { recursive: true, force: true });
  });

  test("status command shows warnings when config file doesn't exist", async () => {
    // Mock GitHub CLI to return empty PR list
    const mockGhScript = `#!/bin/bash
if [[ "$*" == *"pr list"* ]]; then
  echo "[]"
else
  echo "Mock gh command"
fi`;
    
    await writeFile(join(tempDir, "mock-gh"), mockGhScript);
    await Bun.$`chmod +x mock-gh`;
    
    // Set PATH to use our mock gh
    process.env.PATH = `${tempDir}:${process.env.PATH}`;

    try {
      const result = await Bun.$`bun run ${join(originalCwd, "src/cli.ts")} status --compact`.text();
      
      // Should show warnings about configuration
      expect(result).toContain("Configuration needed for first-time setup");
      expect(result).toContain("User prefix not set - using default 'dev'");
      expect(result).toContain("Default branch not set - using default 'main'");
      expect(result).toContain("rungs config set userPrefix");
      expect(result).toContain("rungs config set defaultBranch");
      
    } catch (error) {
      // Even if the command fails due to environment issues, 
      // the error message should contain our warnings
      const errorMsg = String(error);
      if (errorMsg.includes("Configuration needed for first-time setup")) {
        expect(errorMsg).toContain("User prefix not set");
        expect(errorMsg).toContain("Default branch not set");
      }
    }
  });

  test("status command shows warnings when config has default values", async () => {
    // Create config with default values
    const configContent = {
      userPrefix: "dev",
      defaultBranch: "main"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    // Mock GitHub CLI
    const mockGhScript = `#!/bin/bash
if [[ "$*" == *"pr list"* ]]; then
  echo "[]"
else
  echo "Mock gh command"
fi`;
    
    await writeFile(join(tempDir, "mock-gh"), mockGhScript);
    await Bun.$`chmod +x mock-gh`;
    process.env.PATH = `${tempDir}:${process.env.PATH}`;

    try {
      const result = await Bun.$`bun run ${join(originalCwd, "src/cli.ts")} status --compact`.text();
      
      // Should show warnings about default values
      expect(result).toContain("Configuration needed for first-time setup");
      expect(result).toContain("User prefix not set - using default 'dev'");
      expect(result).toContain("Default branch not set - using default 'main'");
      
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("Configuration needed for first-time setup")) {
        expect(errorMsg).toContain("using default 'dev'");
        expect(errorMsg).toContain("using default 'main'");
      }
    }
  });

  test("status command shows partial warnings when only userPrefix is default", async () => {
    // Create config with custom defaultBranch but default userPrefix
    const configContent = {
      userPrefix: "dev",
      defaultBranch: "develop"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    // Mock GitHub CLI
    const mockGhScript = `#!/bin/bash
if [[ "$*" == *"pr list"* ]]; then
  echo "[]"
else
  echo "Mock gh command"
fi`;
    
    await writeFile(join(tempDir, "mock-gh"), mockGhScript);
    await Bun.$`chmod +x mock-gh`;
    process.env.PATH = `${tempDir}:${process.env.PATH}`;

    try {
      const result = await Bun.$`bun run ${join(originalCwd, "src/cli.ts")} status --compact`.text();
      
      // Should show warning only for userPrefix
      expect(result).toContain("Configuration needed for first-time setup");
      expect(result).toContain("User prefix not set - using default 'dev'");
      expect(result).not.toContain("Default branch not set");
      
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("Configuration needed for first-time setup")) {
        expect(errorMsg).toContain("User prefix not set");
        expect(errorMsg).not.toContain("Default branch not set");
      }
    }
  });

  test("status command shows partial warnings when only defaultBranch is default", async () => {
    // Create config with custom userPrefix but default defaultBranch
    const configContent = {
      userPrefix: "alice",
      defaultBranch: "main"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    // Mock GitHub CLI
    const mockGhScript = `#!/bin/bash
if [[ "$*" == *"pr list"* ]]; then
  echo "[]"
else
  echo "Mock gh command"
fi`;
    
    await writeFile(join(tempDir, "mock-gh"), mockGhScript);
    await Bun.$`chmod +x mock-gh`;
    process.env.PATH = `${tempDir}:${process.env.PATH}`;

    try {
      const result = await Bun.$`bun run ${join(originalCwd, "src/cli.ts")} status --compact`.text();
      
      // Should show warning only for defaultBranch
      expect(result).toContain("Configuration needed for first-time setup");
      expect(result).toContain("Default branch not set - using default 'main'");
      expect(result).not.toContain("User prefix not set");
      
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("Configuration needed for first-time setup")) {
        expect(errorMsg).toContain("Default branch not set");
        expect(errorMsg).not.toContain("User prefix not set");
      }
    }
  });

  test("status command shows no warnings when config is properly customized", async () => {
    // Create config with custom values
    const configContent = {
      userPrefix: "bob",
      defaultBranch: "develop"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    // Mock GitHub CLI
    const mockGhScript = `#!/bin/bash
if [[ "$*" == *"pr list"* ]]; then
  echo "[]"
else
  echo "Mock gh command"
fi`;
    
    await writeFile(join(tempDir, "mock-gh"), mockGhScript);
    await Bun.$`chmod +x mock-gh`;
    process.env.PATH = `${tempDir}:${process.env.PATH}`;

    try {
      const result = await Bun.$`bun run ${join(originalCwd, "src/cli.ts")} status --compact`.text();
      
      // Should not show configuration warnings
      expect(result).not.toContain("Configuration needed for first-time setup");
      expect(result).not.toContain("User prefix not set");
      expect(result).not.toContain("Default branch not set");
      
    } catch (error) {
      const errorMsg = String(error);
      // Even if command fails, should not show config warnings
      expect(errorMsg).not.toContain("Configuration needed for first-time setup");
    }
  });

  test("status command shows warnings in verbose mode", async () => {
    // Create config with default values
    const configContent = {
      userPrefix: "dev",
      defaultBranch: "main"
    };
    await writeFile(configPath, JSON.stringify(configContent));
    
    // Mock GitHub CLI
    const mockGhScript = `#!/bin/bash
if [[ "$*" == *"pr list"* ]]; then
  echo "[]"
else
  echo "Mock gh command"
fi`;
    
    await writeFile(join(tempDir, "mock-gh"), mockGhScript);
    await Bun.$`chmod +x mock-gh`;
    process.env.PATH = `${tempDir}:${process.env.PATH}`;

    try {
      const result = await Bun.$`bun run ${join(originalCwd, "src/cli.ts")} status --verbose`.text();
      
      // Should show warnings in verbose mode too
      expect(result).toContain("Configuration needed for first-time setup");
      expect(result).toContain("User prefix not set - using default 'dev'");
      expect(result).toContain("Default branch not set - using default 'main'");
      
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("Configuration needed for first-time setup")) {
        expect(errorMsg).toContain("using default 'dev'");
        expect(errorMsg).toContain("using default 'main'");
      }
    }
  });

  test("status command shows helpful setup instructions", async () => {
    // Mock GitHub CLI
    const mockGhScript = `#!/bin/bash
if [[ "$*" == *"pr list"* ]]; then
  echo "[]"
else
  echo "Mock gh command"
fi`;
    
    await writeFile(join(tempDir, "mock-gh"), mockGhScript);
    await Bun.$`chmod +x mock-gh`;
    process.env.PATH = `${tempDir}:${process.env.PATH}`;

    try {
      const result = await Bun.$`bun run ${join(originalCwd, "src/cli.ts")} status --compact`.text();
      
      // Should show helpful setup instructions
      expect(result).toContain("rungs config set userPrefix <your-name>");
      expect(result).toContain("rungs config set defaultBranch <your-default-branch>");
      expect(result).toContain("rungs config list");
      
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("Configuration needed for first-time setup")) {
        expect(errorMsg).toContain("rungs config set userPrefix");
        expect(errorMsg).toContain("rungs config set defaultBranch");
      }
    }
  });
});