#!/usr/bin/env bun

import { parseArgs } from "util";
import { GitManager } from "./git-manager.js";
import { GitHubManager } from "./github-manager.js";
import { ConfigManager } from "./config-manager.js";
import { StackManager } from "./stack-manager.js";
import { output, setVerbose, logSummary, setOutputMode, startOperation, completeOperation, failOperation } from "./output-manager.js";
import { OperationTracker } from "./operation-tracker.js";

interface CliOptions {
  help?: boolean;
  config?: string;
  verbose?: boolean;
  quiet?: boolean;
  compact?: boolean;
  outputMode?: string;
  noColor?: boolean;
  noSpinner?: boolean;
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
        quiet: { type: "boolean", short: "q" },
        compact: { type: "boolean" },
        "output-mode": { type: "string" },
        "no-color": { type: "boolean" },
        "no-spinner": { type: "boolean" },
        "auto-publish": { type: "boolean" },
        force: { type: "boolean", short: "f" }
      },
      allowPositionals: true
    });

    const options = {
      ...values,
      autoPublish: values["auto-publish"],
      outputMode: values["output-mode"],
      noColor: values["no-color"],
      noSpinner: values["no-spinner"]
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

    // Configure output mode
    const config = new ConfigManager(options.config);
    const userConfig = await config.getAll();
    
    // Determine output mode based on flags and config
    let outputMode = userConfig.output.mode;
    if (options.quiet || options.compact) {
      outputMode = 'compact';
    } else if (options.verbose) {
      outputMode = 'verbose';
    } else if (options.outputMode) {
      outputMode = options.outputMode as 'verbose' | 'compact';
    }
    
    // Apply output configuration
    setOutputMode(outputMode);
    
    // Set verbose mode for backward compatibility
    if (options.verbose || outputMode === 'verbose') {
      setVerbose(true);
    }
    
    // Note: Output manager configuration is handled through the global output instance
    // Future enhancement: Add method to update output manager configuration dynamically
    const git = new GitManager();
    const github = new GitHubManager();
    const stack = new StackManager(config, git, github, outputMode);

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
  -h, --help           Show help information
  -c, --config PATH    Specify config file path
  -v, --verbose        Enable verbose output mode
  -q, --quiet          Enable compact output mode (same as --compact)
      --compact        Enable compact output mode
      --output-mode    Set output mode: 'verbose' or 'compact'
      --no-color       Disable colored output
      --no-spinner     Disable spinner animations
  -f, --force          Force operation, bypassing safety checks
      --auto-publish   Create PRs as published instead of draft

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
  // In verbose mode, use the traditional section-based approach
  if (output.getOutputMode() === 'verbose') {
    output.startSection("Push Stack Operation", "stack");
    await stack.pushStack(options.autoPublish, options.force);
    output.success("Stack operation completed successfully!");
    output.endSection();
    return;
  }
  
  // In compact mode, use OperationTracker pattern (like handleStatus does)
  const tracker = new OperationTracker(output);
  await tracker.stackOperation(
    "Creating stack",
    async () => {
      await stack.pushStack(options.autoPublish, options.force);
      return { success: true };
    },
    {
      successMessage: () => "Stack operation completed successfully",
      showElapsed: true
    }
  );
}

async function handleStatus(stack: StackManager, options: CliOptions) {
  // Create operation tracker for better progress management
  const tracker = new OperationTracker(output);
  
  try {
    // In verbose mode, use the old section-based approach
    if (output.getOutputMode() === 'verbose') {
      output.startSection("Stack Status", "stack");
      const status = await stack.getStatus();
      console.log(status);
      output.endSection();
      return;
    }
    
    // In compact mode, use operation-based approach
    const stackState = await tracker.stackOperation(
      "Retrieving stack status",
      async () => {
        return await stack.getCurrentStack();
      },
      {
        successMessage: (result) => `Stack status retrieved - ${result.prs.length} PRs${result.unstakedCommits && result.unstakedCommits.length > 0 ? `, ${result.unstakedCommits.length} unstacked commits` : ''}`,
        showElapsed: true
      }
    );
    
    // Display the status information in compact format
    if (stackState.prs.length > 0) {
      console.log(`Stack Status: ${stackState.prs.length} PRs`);
      console.log("");
      
      stackState.prs.forEach((pr, i) => {
        console.log(`PR #${pr.number}: ${pr.title} → ${pr.url}`);
        console.log(`  Base: ${pr.base}`);
        
        if (pr.commits && pr.commits.length > 0) {
          pr.commits.forEach(commit => {
            console.log(`  ${commit.hash.slice(0, 7)} ${commit.message}`);
          });
        } else {
          console.log(`  (no commits)`);
        }
        
        if (i < stackState.prs.length - 1) {
          console.log("");
        }
      });
    } else {
      console.log("Stack Status: No active PRs");
    }
    
    // Display unstacked commits
    if (stackState.unstakedCommits && stackState.unstakedCommits.length > 0) {
      console.log("");
      console.log(`New Commits (ready to push): ${stackState.unstakedCommits.length}`);
      stackState.unstakedCommits.forEach(commit => {
        console.log(`  ${commit.hash.slice(0, 7)} ${commit.message}`);
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    output.error(`Failed to get stack status: ${errorMessage}`);
    process.exit(1);
  }
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
  
  // In verbose mode, use the traditional section-based approach
  if (output.getOutputMode() === 'verbose') {
    output.startSection("Merge Pull Request", "github");
    await stack.mergePullRequest(prNumber, mergeMethod, deleteBranch);
    output.endSection();
    return;
  }
  
  // In compact mode, use OperationTracker pattern
  const tracker = new OperationTracker(output);
  const prText = prNumber ? `#${prNumber}` : "current branch's PR";
  await tracker.githubOperation(
    `Merging PR ${prText}`,
    async () => {
      await stack.mergePullRequest(prNumber, mergeMethod, deleteBranch);
      return { success: true };
    },
    {
      successMessage: () => `Successfully merged PR ${prText}`,
      showElapsed: true
    }
  );
}

async function handleRebase(stack: StackManager, args: string[], options: CliOptions) {
  // The new StackManager auto-fixes broken chains during normal operations
  output.startSection("Rebase Stack", "stack");
  output.info("The new GitHub-first stack manager automatically fixes broken chains.");
  output.info("Stack bases are updated automatically when you run 'rungs status' or 'rungs stack'.");
  output.info("Manual rebase is no longer needed!");
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
