# Rungs CLI Specification

## Overview

Rungs is a CLI tool for managing stacked diffs with Git and GitHub, making the workflow feel more native. It allows developers to work with multiple commits on their main branch and automatically create GitHub PRs for each logical stack of changes.

## Core Concepts

### Stacked Diffs Workflow
- Developer works on main branch with multiple commits
- Each "stack" of commits becomes a separate GitHub PR
- PRs are created in draft mode by default
- Branch creation is abstracted away from the user
- Local main branch retains all commits for continued development

### Branch Naming Strategy
- Branches are automatically created with reasonable names based on commit messages
- Format: `{username}/{commit-message-slug}`
- Example: `john/fix-authentication-bug`

## Command Structure

```bash
rungs <command> [options]
```

### Primary Commands

#### `rungs push`
Creates or updates GitHub PRs for commits on main branch.

```bash
rungs push [options]
```

**Options:**
- `--draft` - Create PR in draft mode (default: true)
- `--ready` - Create PR in ready-for-review mode
- `--stack-size <n>` - Number of commits to include in current stack (default: auto-detect)
- `--base <branch>` - Base branch for PR (default: origin/main)
- `--dry-run` - Show what would be done without executing
- `--force` - Force push changes, overwriting existing PRs

#### `rungs sync`
Updates local main to be current with remote.

```bash
rungs sync [options]
```

**Options:**
- `--rebase` - Rebase local commits on top of updated main (default)
- `--merge` - Merge remote changes instead of rebasing
- `--force` - Force sync even if there are conflicts

#### `rungs status`
Shows current state of stacks and PRs.

```bash
rungs status [options]
```

**Options:**
- `--verbose` - Show detailed information about each stack
- `--remote` - Include remote PR status

#### `rungs config`
Manages configuration settings.

```bash
rungs config <key> [value]
rungs config --list
rungs config --reset
```

#### `rungs init`
Initializes rungs in current repository.

```bash
rungs init [options]
```

**Options:**
- `--github-repo <owner/repo>` - Specify GitHub repository
- `--base-branch <branch>` - Set default base branch (default: main)

## Detailed Workflow

### Initial Setup
1. User runs `rungs init` in their Git repository
2. Rungs detects GitHub repository using `gh` CLI
3. Creates `.rungs.json` config file
4. Validates GitHub CLI authentication

### Stack Creation Process
1. User makes commits on main branch
2. User runs `rungs push`
3. Rungs performs the following:
   - Syncs local main with remote (`git fetch origin main`)
   - Rebases local commits on top of updated main
   - Identifies new commits since last push
   - Groups commits into logical stacks
   - For each stack:
     - Creates a branch with auto-generated name
     - Pushes branch to remote
     - Creates GitHub PR using `gh pr create`
     - Links PRs in stack order (if multiple stacks)

### Stack Detection Algorithm
- **Single Stack**: All commits since last sync are included in one PR
- **Multiple Stacks**: Commits are grouped based on:
  - File changes (commits touching same files grouped together)
  - Commit message patterns (fix/feat/refactor prefixes)
  - Time gaps between commits (configurable threshold)
  - Manual stack boundaries (special commit message markers)

### Subsequent Pushes
1. User makes additional commits on main
2. User runs `rungs push` again
3. Rungs:
   - Identifies commits not yet in any PR
   - Creates new PR(s) for new commits
   - Updates existing PRs if force-pushed
   - Maintains commit order and relationships

## Configuration

### Configuration File: `.rungs.json`

```json
{
  "github": {
    "owner": "username",
    "repo": "repository-name",
    "baseBranch": "main"
  },
  "branches": {
    "prefix": "username",
    "nameStrategy": "commit-message",
    "maxLength": 50
  },
  "stacks": {
    "autoDetect": true,
    "maxStackSize": 10,
    "groupingStrategy": "file-based",
    "timeGapThreshold": "2h"
  },
  "prs": {
    "defaultDraft": true,
    "autoLink": true,
    "template": ".github/pull_request_template.md"
  },
  "sync": {
    "autoSync": true,
    "strategy": "rebase"
  }
}
```

### Configuration Options

#### GitHub Settings
- `github.owner` - GitHub repository owner
- `github.repo` - GitHub repository name
- `github.baseBranch` - Default base branch for PRs

#### Branch Settings
- `branches.prefix` - Prefix for generated branch names
- `branches.nameStrategy` - How to generate branch names (`commit-message`, `incremental`, `timestamp`)
- `branches.maxLength` - Maximum length for branch names

#### Stack Settings
- `stacks.autoDetect` - Automatically detect stack boundaries
- `stacks.maxStackSize` - Maximum commits per stack
- `stacks.groupingStrategy` - How to group commits (`file-based`, `time-based`, `message-based`)
- `stacks.timeGapThreshold` - Time gap to trigger new stack

#### PR Settings
- `prs.defaultDraft` - Create PRs in draft mode by default
- `prs.autoLink` - Automatically link related PRs
- `prs.template` - Path to PR template file

#### Sync Settings
- `sync.autoSync` - Automatically sync before push
- `sync.strategy` - Sync strategy (`rebase`, `merge`)

## Error Handling

### Common Error Scenarios

#### Git Conflicts
- **Scenario**: Rebase conflicts during sync
- **Handling**: 
  - Pause operation and show conflict details
  - Provide guidance for manual resolution
  - Allow resuming after resolution with `rungs sync --continue`

#### GitHub Authentication
- **Scenario**: `gh` CLI not authenticated or insufficient permissions
- **Handling**:
  - Check `gh auth status`
  - Provide clear instructions for authentication
  - Validate repository access permissions

#### Remote Branch Conflicts
- **Scenario**: Generated branch name already exists with different commits
- **Handling**:
  - Append numeric suffix to branch name
  - Warn user about naming conflict
  - Offer option to force-update existing branch

#### Uncommitted Changes
- **Scenario**: User has uncommitted changes when running commands
- **Handling**:
  - Warn about uncommitted changes
  - Offer to stash changes automatically
  - Prevent operation if changes would be lost

#### Missing Base Branch
- **Scenario**: Configured base branch doesn't exist
- **Handling**:
  - List available branches
  - Suggest closest match
  - Allow user to update configuration

### Error Recovery
- All operations should be atomic where possible
- Provide clear rollback instructions for failed operations
- Maintain operation log for debugging
- Offer `--force` options for advanced users

## Technical Requirements

### Dependencies
- **Bun**: Runtime and package manager
- **Git**: Version control operations
- **GitHub CLI (`gh`)**: GitHub API interactions

### System Requirements
- Git repository with GitHub remote
- GitHub CLI installed and authenticated
- Bun runtime environment
- POSIX-compatible shell (for Git operations)

### File System Interactions
- Read/write `.rungs.json` configuration file
- Create temporary branch references
- Read Git history and commit information
- Access GitHub PR templates if configured

### GitHub API Usage
- Create draft/ready PRs via `gh pr create`
- List existing PRs via `gh pr list`
- Update PR metadata via `gh pr edit`
- Check repository permissions via `gh repo view`

## Example Scenarios

### Scenario 1: Initial Project Setup
```bash
# Clone repository and navigate to it
git clone https://github.com/user/project.git
cd project

# Initialize rungs
rungs init
# Creates .rungs.json with detected GitHub repo

# Make some commits
git add feature.js
git commit -m "feat: add new feature"
git add fix.js  
git commit -m "fix: resolve authentication bug"

# Create PRs for commits
rungs push
# Creates:
# - Branch: user/feat-add-new-feature
# - Branch: user/fix-resolve-authentication-bug  
# - Two draft PRs on GitHub
```

### Scenario 2: Continuing Development
```bash
# Previous PRs exist, make new commits
git add enhancement.js
git commit -m "refactor: improve performance"

# Push new changes
rungs push
# Creates new PR for latest commit only
# Previous PRs remain unchanged
```

### Scenario 3: Large Feature Development
```bash
# Multiple related commits
git add auth/login.js
git commit -m "feat: implement login flow"
git add auth/logout.js  
git commit -m "feat: implement logout flow"
git add auth/middleware.js
git commit -m "feat: add auth middleware"

# Push as single stack
rungs push --stack-size 3
# Creates one PR with all three commits
# Branch: user/feat-implement-login-flow
```

### Scenario 4: Sync and Conflict Resolution
```bash
# Sync with remote changes
rungs sync
# Fetches latest main and rebases local commits

# If conflicts occur:
# 1. Rungs pauses and shows conflict details
# 2. User resolves conflicts manually
# 3. User continues: rungs sync --continue
```

### Scenario 5: Status Checking
```bash
# Check current state
rungs status
# Output:
# Stack 1: feat-add-new-feature (PR #123) - Draft
# Stack 2: fix-resolve-authentication-bug (PR #124) - Ready for review
# Local: 2 commits ahead of origin/main

rungs status --verbose
# Shows detailed commit information and PR links
```

## Implementation Notes

### Branch Naming Algorithm
1. Extract meaningful words from commit message
2. Remove common words (a, an, the, etc.)
3. Convert to kebab-case
4. Truncate to max length
5. Add username prefix
6. Handle collisions with numeric suffix

### Stack Detection Logic
- Parse commit history since last successful push
- Group commits based on configuration strategy
- Respect manual stack boundaries (special commit markers)
- Ensure each stack has reasonable size

### GitHub Integration
- Use `gh` CLI for all GitHub operations
- Maintain mapping between local commits and remote PRs
- Handle GitHub API rate limits gracefully
- Support GitHub Enterprise via `gh` configuration

### State Management
- Track last successful push SHA in `.rungs.json`
- Maintain branch-to-PR mapping
- Store stack relationships for linking PRs
- Cache GitHub repository metadata

This specification provides a comprehensive foundation for implementing the rungs CLI tool with clear workflows, robust error handling, and flexible configuration options.
