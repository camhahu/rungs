#!/usr/bin/env bun

import { parseArgs } from "util";
import { GitManager } from "./git-manager.js";
import { GitHubManager } from "./github-manager.js";
import { ConfigManager } from "./config-manager.js";
import { StackManager } from "./stack-manager.js";

interface CliOptions {
  help?: boolean;
  config?: string;
  verbose?: boolean;
}

const COMMANDS = {
  push: "Create a new stack or add commits to existing stack",
  status: "Show current stack status",
  rebase: "Rebase stack when PRs are merged",
  config: "Manage configuration",
  help: "Show help information"
} as const;

type Command = keyof typeof COMMANDS;

async function main() {
  try {
    const { positionals, values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        help: { type: "boolean", short: "h" },
        config: { type: "string", short: "c" },
        verbose: { type: "boolean", short: "v" }
      },
      allowPositionals: true
    });

    const options = values as CliOptions;
    const [command, ...args] = positionals;

    if (options.help || !command || command === "help") {
      showHelp();
      return;
    }

    if (!isValidCommand(command)) {
      console.error(`Unknown command: ${command}`);
      console.error("Run 'rungs help' for available commands.");
      process.exit(1);
    }

    const config = new ConfigManager(options.config);
    const git = new GitManager();
    const github = new GitHubManager();
    const stack = new StackManager(config, git, github);

    switch (command) {
      case "push":
        await handlePush(stack, args, options);
        break;
      case "status":
        await handleStatus(stack, options);
        break;
      case "rebase":
        await handleRebase(stack, args, options);
        break;
      case "config":
        await handleConfig(config, args, options);
        break;
      default:
        console.error(`Command not implemented: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    if (process.argv.includes("--verbose") || process.argv.includes("-v")) {
      console.error(error);
    }
    process.exit(1);
  }
}

function isValidCommand(cmd: string): cmd is Command {
  return cmd in COMMANDS;
}

function showHelp() {
  console.log(`
rungs - CLI tool for managing stacked diffs with Git and GitHub

USAGE:
  rungs <command> [options]

COMMANDS:
${Object.entries(COMMANDS).map(([cmd, desc]) => `  ${cmd.padEnd(10)} ${desc}`).join('\n')}

OPTIONS:
  -h, --help       Show help information
  -c, --config     Path to config file
  -v, --verbose    Enable verbose output

EXAMPLES:
  rungs push                 # Create/update stack with current commits
  rungs status               # Show current stack status
  rungs config set name john # Set user name prefix for branches
  rungs help                 # Show this help
`);
}

async function handlePush(stack: StackManager, args: string[], options: CliOptions) {
  console.log("Creating or updating stack...");
  await stack.pushStack();
  console.log("Stack operation completed successfully!");
}

async function handleStatus(stack: StackManager, options: CliOptions) {
  console.log("Checking stack status...");
  const status = await stack.getStatus();
  console.log(status);
}

async function handleRebase(stack: StackManager, args: string[], options: CliOptions) {
  const [prNumber] = args;
  
  if (!prNumber) {
    console.error("Usage: rungs rebase <pr-number>");
    console.error("Rebase the stack after PR <pr-number> has been merged.");
    process.exit(1);
  }
  
  console.log(`Rebasing stack after PR #${prNumber} merge...`);
  await stack.rebaseStack(parseInt(prNumber));
  console.log("Stack rebased successfully!");
}

async function handleConfig(config: ConfigManager, args: string[], options: CliOptions) {
  const [action, key, value] = args;
  
  if (action === "set" && key && value) {
    await config.set(key, value);
    console.log(`Set ${key} = ${value}`);
  } else if (action === "get" && key) {
    const val = await config.get(key);
    console.log(`${key} = ${val ?? "undefined"}`);
  } else if (action === "list" || !action) {
    const allConfig = await config.getAll();
    console.log("Configuration:");
    for (const [k, v] of Object.entries(allConfig)) {
      console.log(`  ${k} = ${v}`);
    }
  } else {
    console.error("Usage: rungs config [set <key> <value> | get <key> | list]");
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
