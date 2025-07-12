#!/usr/bin/env bun

import { parseArgs } from "util";
import { GitManager } from "./git-manager.js";
import { GitHubManager } from "./github-manager.js";
import { ConfigManager } from "./config-manager.js";
import { StackManager } from "./stack-manager.js";
import { output, setVerbose, logSummary } from "./output-manager.js";

interface CliOptions {
  help?: boolean;
  config?: string;
  verbose?: boolean;
  autoPublish?: boolean;
  force?: boolean;
}

const COMMANDS = {
  stack: "Create a new stack or add commits to existing stack",
  status: "Show current stack status",
  merge: "Merge PRs and update stack state",
  publish: "Mark PR as ready for review (remove draft status)",
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
        verbose: { type: "boolean", short: "v" },
        "auto-publish": { type: "boolean" },
        force: { type: "boolean", short: "f" }
      },
      allowPositionals: true
    });

    const options = {
      ...values,
      autoPublish: values["auto-publish"]
    } as CliOptions;
    const [command, ...args] = positionals;

    if (options.help || !command || command === "help") {
      showHelp();
      return;
    }

    if (!isValidCommand(command)) {
      output.error(`Unknown command: ${command}`);
      output.info("Run 'rungs help' for available commands.");
      process.exit(1);
    }

    // Set verbose mode if requested
    if (options.verbose) {
      setVerbose(true);
    }

    const config = new ConfigManager(options.config);
    const git = new GitManager();
    const github = new GitHubManager();
    const stack = new StackManager(config, git, github);

    switch (command) {
      case "stack":
        await handlePush(stack, args, options);
        break;
      case "status":
        await handleStatus(stack, options);
        break;
      case "merge":
        await handleMerge(stack, args, options);
        break;
      case "publish":
        await handlePublish(stack, args, options);
        break;
      case "rebase":
        await handleRebase(stack, args, options);
        break;
      case "config":
        await handleConfig(config, args, options);
        break;
      default:
        output.error(`Command not implemented: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    output.error(error instanceof Error ? error.message : String(error));
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
  -f, --force        Force operation, bypassing safety checks
      --auto-publish Create PRs as published instead of draft

EXAMPLES:
  rungs stack                      # Create/update stack with current commits
  rungs stack --auto-publish       # Create PRs as published instead of draft
  rungs stack --force              # Create PRs even if local is out of sync
  rungs publish 123                # Mark PR #123 as ready for review
  rungs publish                    # Mark top PR in stack as ready for review
  rungs status                     # Show current stack status
  rungs config set name john       # Set user name prefix for branches
  rungs help                       # Show this help

For more information, visit: https://github.com/camhahu/rungs
`);
}

async function handlePush(stack: StackManager, args: string[], options: CliOptions) {
  output.startSection("Push Stack Operation", "stack");
  await stack.pushStack(options.autoPublish, options.force);
  output.success("Stack operation completed successfully!");
  output.endSection();
}

async function handleStatus(stack: StackManager, options: CliOptions) {
  output.startSection("Stack Status", "stack");
  const status = await stack.getStatus();
  console.log(status);
  output.endSection();
}

async function handlePublish(stack: StackManager, args: string[], options: CliOptions) {
  const [prNumberStr] = args;
  
  output.startSection("Publish Pull Request", "github");
  
  if (prNumberStr) {
    const prNumber = parseInt(prNumberStr);
    if (isNaN(prNumber)) {
      output.error("PR number must be a valid integer");
      process.exit(1);
    }
    
    output.progress(`Publishing PR #${prNumber}...`);
    await stack.publishPullRequest(prNumber);
    output.success(`Successfully published PR #${prNumber}`);
  } else {
    output.progress("Publishing top PR in stack...");
    await stack.publishPullRequest();
    output.success("Successfully published top PR in stack");
  }
  
  output.endSection();
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
    output.error("PR number must be a valid integer");
    process.exit(1);
  }
  
  output.startSection("Merge Pull Request", "github");
  await stack.mergePullRequest(prNumber, mergeMethod, deleteBranch);
  output.endSection();
}

async function handleRebase(stack: StackManager, args: string[], options: CliOptions) {
  const [prNumber] = args;
  
  if (!prNumber) {
    output.error("Usage: rungs rebase <pr-number>");
    output.error("Rebase the stack after PR <pr-number> has been merged.");
    process.exit(1);
  }
  
  output.startSection("Rebase Stack", "stack");
  output.progress(`Rebasing stack after PR #${prNumber} merge...`);
  await stack.rebaseStack(parseInt(prNumber));
  output.success("Stack rebased successfully!");
  output.endSection();
}

async function handleConfig(config: ConfigManager, args: string[], options: CliOptions) {
  const [action, key, value] = args;
  
  output.startSection("Configuration", "config");
  
  if (action === "set" && key && value) {
    await config.set(key, value);
    output.success(`Set ${key} = ${value}`);
  } else if (action === "get" && key) {
    const val = await config.get(key);
    output.info(`${key} = ${val ?? "undefined"}`);
  } else if (action === "list" || !action) {
    const allConfig = await config.getAll();
    
    const configItems = Object.entries(allConfig).map(([k, v]) => ({
      label: k,
      value: v
    }));
    
    logSummary("Current Configuration", configItems);
  } else {
    output.error("Usage: rungs config [set <key> <value> | get <key> | list]");
    process.exit(1);
  }
  
  output.endSection();
}

if (import.meta.main) {
  main();
}
