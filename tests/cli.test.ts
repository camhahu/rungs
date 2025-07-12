import { test, expect } from "bun:test";
import { $ } from "bun";

test("should show help when no command provided", async () => {
  const result = await $`bun run src/cli.ts`.text();
  
  expect(result).toContain("rungs - CLI tool for managing stacked diffs");
  expect(result).toContain("USAGE:");
  expect(result).toContain("COMMANDS:");
  expect(result).toContain("push");
  expect(result).toContain("status");
  expect(result).toContain("config");
});

test("should show help with --help flag", async () => {
  const result = await $`bun run src/cli.ts --help`.text();
  
  expect(result).toContain("rungs - CLI tool for managing stacked diffs");
  expect(result).toContain("EXAMPLES:");
});

test("should show help with help command", async () => {
  const result = await $`bun run src/cli.ts help`.text();
  
  expect(result).toContain("rungs - CLI tool for managing stacked diffs");
});

test("should handle unknown command", async () => {
  try {
    await $`bun run src/cli.ts unknown-command`.text();
    expect(true).toBe(false); // Should not reach here
  } catch (error: any) {
    expect(error.exitCode).toBe(1);
    expect(error.stderr.toString()).toContain("Unknown command: unknown-command");
  }
});

test("should handle config command", async () => {
  // Test config list (should not fail even without config file)
  const result = await $`bun run src/cli.ts config list`.text();
  expect(result).toContain("Configuration:");
});
