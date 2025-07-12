# Rungs - Stacked Diffs CLI

A CLI tool for managing stacked diffs with Git and GitHub, making the workflow feel more native.

## Installation

```bash
bun install
bun run build
```

## Usage

```bash
# Create or update a stack with current commits
rungs push

# Show current stack status
rungs status

# Manage configuration
rungs config set userPrefix john
rungs config list
```

## How It Works

Rungs implements a stacked diffs workflow:

1. **Make commits** on your main branch
2. **Run `rungs push`** to create a PR with those commits
3. **Continue working** - make more commits on main
4. **Run `rungs push` again** to create a new PR with just the new commits

Each PR is independent and can be reviewed/merged separately, creating a natural stacked workflow.

## Commands

- `rungs push` - Create a new stack or add commits to existing stack
- `rungs status` - Show current stack status  
- `rungs config` - Manage configuration
- `rungs help` - Show help information

## Development

```bash
bun run dev     # Run in development mode
bun test        # Run tests
bun run build   # Build the CLI
bun run cli     # Run the CLI locally
```

This project was created using `bun init` in bun v1.2.18. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
