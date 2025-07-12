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
  merge: "Merge PRs and update stack state",
  config: "Manage configuration",
  help: "Show help information"
} as const;

const HIDDEN_COMMANDS = {
  rebase: "Rebase stack when PRs are merged"
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
      case "merge":
        await handleMerge(stack, args, options);
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
  return cmd in COMMANDS || cmd in HIDDEN_COMMANDS;
}

function showHelp() {
  console.log(`
rungs - CLI tool for managing stacked diffs with Git and GitHub

USAGE:
  rungs <command> [options]

COMMANDS:
${Object.entries(COMMANDS).map(([cmd, desc]) => `  ${cmd.padEnd(12)} ${desc}`).join('\n')}

OPTIONS:
  -h, --help         Show help information
  -c, --config PATH  Specify config file path
  -v, --verbose      Enable verbose output

EXAMPLES:
  rungs push                   # Create/update stack with current commits
  rungs status                 # Show current stack status
  rungs config set name john   # Set user name prefix for branches
  rungs help                   # Show this help

For more information, visit: https://github.com/camhahu/rungs
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

async function handleMerge(stack: StackManager, args: string[], options: CliOptions) {
  const [prNumberStr, ...flags] = args;
  
  // Parse options
  let mergeMethod: "squash" | "merge" | "rebase" = "squash";
  let deleteBranch = true;
  
  for (const flag of flags) {
    switch (flag) {
      case "--squash":
        mergeMethod = "squash";
        break;
      case "--merge":
        mergeMethod = "merge";
        break;
      case "--rebase":
        mergeMethod = "rebase";
        break;
      case "--no-delete-branch":
        deleteBranch = false;
        break;
      case "--delete-branch":
        deleteBranch = true;
        break;
    }
  }
  
  const prNumber = prNumberStr ? parseInt(prNumberStr) : undefined;
  
  if (prNumberStr && isNaN(prNumber!)) {
    console.error("Error: PR number must be a valid integer");
    process.exit(1);
  }
  
  await stack.mergePullRequest(prNumber, mergeMethod, deleteBranch);
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
