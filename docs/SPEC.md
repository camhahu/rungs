# Rungs CLI Specification

## Overview

Rungs is a CLI tool for managing stacked diffs with Git and GitHub, making the workflow feel more native. It allows developers to work with multiple commits on their main branch and automatically create GitHub PRs for each logical stack of changes.

## Core Concepts

### Stacked Diffs Workflow
- Developer works on main branch with multiple commits
- Each push creates a GitHub PR with all new commits since last push
- PRs are created in draft mode by default
- Branch creation is abstracted away from the user
- Local main branch retains all commits for continued development
- Automatic GitHub sync keeps local state current with remote PRs

### Branch Naming Strategy
- Branches are automatically created with reasonable names based on commit messages
- Format: `{username}/{commit-message-slug}`
- Example: `john/fix-authentication-bug`

## Command Structure

```bash
rungs <command> [options]
```

### Implemented Commands

#### `rungs push`
Creates or updates GitHub PRs for commits on main branch.

```bash
rungs push [options]
```

**Behavior:**
- **Sync validation**: Checks that local branch is in sync with remote before creating PRs
- Automatically syncs with GitHub to get current PR status
- Creates one PR containing all new commits since last push
- Automatically detects merged PRs and updates stack state
- Uses automatic rebase when merged PRs are detected

**Sync Validation:**
- Detects when local branch is ahead/behind/diverged from remote
- Identifies duplicate commits that may cause merge conflicts
- Provides specific resolution guidance for each scenario
- Prevents creation of unmergeable PRs

**Options:**
- `--auto-publish` - Create PR in ready-for-review mode (default: draft)
- `--force` - Bypass sync validation checks (not recommended)

#### `rungs status`
Shows current state of stacks and PRs with GitHub sync.

```bash
rungs status [options]
```

**Behavior:**
- Automatically syncs with GitHub before showing status
- Shows current stack with PR information
- Displays commit information and GitHub PR links
- Indicates which PRs are merged/draft/ready

#### `rungs config`
Manages configuration settings.

```bash
rungs config <key> [value]
rungs config --list
rungs config --reset
```

**Supported operations:**
- `rungs config --list` - Show all configuration
- `rungs config <key>` - Get specific configuration value
- `rungs config <key> <value>` - Set configuration value

#### `rungs merge [pr-number]`
Merge PRs through rungs and automatically handle stack cleanup.

```bash
rungs merge [pr-number] [options]
```

**Behavior:**
- If no pr-number provided, merge the top PR in the current stack
- Merge the specified PR on GitHub 
- Automatically trigger stack cleanup (same as `rungs status` does)
- Update remaining PRs in the stack with correct base branches
- Remove merged PR from local state tracking
- Handle both squash and merge commit scenarios

**Options:**
- `--squash` - Use squash merge (default)
- `--merge` - Use regular merge
- `--rebase` - Use rebase merge
- `--delete-branch` - Delete the branch after merge (default: true)

**Examples:**
```bash
rungs merge              # Merge top PR in current stack
rungs merge 42           # Merge specific PR #42
rungs merge --merge      # Use merge commit instead of squash
rungs merge --no-delete-branch  # Keep branch after merge
```

**Integration:** This command uses the same auto-rebase logic to ensure proper stack maintenance.

### Planned Commands

#### `rungs init` *(Not Yet Implemented)*
Will initialize rungs in current repository.

#### `rungs sync` *(Not Yet Implemented)*
Will manually sync with remote changes.

## Detailed Workflow

### Current Stack Creation Process
1. User makes commits on main branch
2. User runs `rungs push`
3. Rungs performs the following:
   - Automatically syncs with GitHub to get current PR states
   - Detects if any PRs in current stack have been merged
   - If merged PRs detected, automatically rebases the stack
   - Identifies new commits since last push
   - Creates a single PR containing all new commits
   - Creates a branch with auto-generated name
   - Pushes branch to remote
   - Creates GitHub PR using `gh pr create`

### Automatic Stack Maintenance
- **GitHub Sync**: Every command automatically syncs with GitHub
- **Merged PR Detection**: Automatically detects when PRs are merged
- **Automatic Rebase**: When merged PRs are detected, stack is automatically rebased
- **Enhanced Base Detection**: Detects PRs with incorrect bases (pointing to merged/deleted branches)
- **Robust Error Handling**: Prevents infinite recursion and handles edge cases gracefully
- **No Manual Rebase**: No separate `rungs rebase` command needed

### Simple Stack Detection
- **Current Implementation**: All commits since last push go into one PR
- **Future Enhancement**: More sophisticated grouping strategies planned

## Configuration

### Configuration File: `~/.config/rungs/config.json`

```json
{
  "userPrefix": "dev",
  "defaultBranch": "main", 
  "draftPRs": true,
  "autoRebase": true,
  "branchNaming": "commit-message"
}
```

### Configuration Options

#### Available Settings
- `userPrefix` - Prefix for generated branch names
- `defaultBranch` - Default base branch for PRs (default: "main")
- `draftPRs` - Create PRs in draft mode by default (default: true)
- `autoRebase` - Enable automatic rebase when merged PRs detected (default: true)
- `branchNaming` - Branch naming strategy (default: "commit-message")

## Automatic GitHub Sync Behavior

### When Sync Occurs
- Before every `rungs push` operation
- Before every `rungs status` operation
- Automatically during stack maintenance

### What Gets Synced
- Current state of all PRs in the stack
- Detection of merged PRs
- PR status changes (draft → ready, etc.)
- Remote branch states

### Automatic Actions
- **Merged PR Detection**: Automatically identifies merged PRs
- **Stack Rebase**: Automatically rebases remaining PRs when merges detected
- **Base Branch Correction**: Automatically fixes PRs pointing to merged/deleted branches
- **State Updates**: Updates local state to match GitHub reality
- **Comprehensive Testing**: Extensive test coverage ensures reliability

## Error Handling

### Common Error Scenarios

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

#### Uncommitted Changes
- **Scenario**: User has uncommitted changes when running commands
- **Handling**:
  - Warn about uncommitted changes
  - Prevent operation if changes would be lost

## Technical Requirements

### Dependencies
- **Bun**: Runtime and package manager
- **Git**: Version control operations
- **GitHub CLI (`gh`)**: GitHub API interactions

### System Requirements
- Git repository with GitHub remote
- GitHub CLI installed and authenticated
- Bun runtime environment

### File System Interactions
- Read/write `~/.config/rungs/config.json` configuration file
- Read/write `~/.config/rungs/{owner}/{repo}/state.json` for stack state per repository
- Create temporary branch references
- Read Git history and commit information

### GitHub API Usage
- Create draft/ready PRs via `gh pr create`
- List existing PRs via `gh pr list`
- Check PR status and merge state
- Update PR metadata via `gh pr edit`

## Example Scenarios

### Scenario 1: Basic Development Workflow
```bash
# Make some commits
git add feature.js
git commit -m "feat: add new feature"
git add fix.js  
git commit -m "fix: resolve authentication bug"

# Create PR for both commits
rungs push
# Creates:
# - Branch: dev/feat-add-new-feature
# - One draft PR on GitHub with both commits

# Check status
rungs status
# Shows current PR with commit details
```

### Scenario 2: Continuing Development After PR Creation
```bash
# Previous PR exists, make new commits
git add enhancement.js
git commit -m "refactor: improve performance"

# Push new changes
rungs push
# Creates new PR for latest commit
# Previous PR remains unchanged
```

### Scenario 3: After PR Gets Merged
```bash
# Make new commits after a PR was merged on GitHub
git add newfile.js
git commit -m "feat: add another feature"

# Push - automatic rebase happens
rungs push
# - Detects previous PR was merged
# - Automatically rebases the stack
# - Creates new PR for the new commit
```

### Scenario 4: Status Checking
```bash
# Check current state (with GitHub sync)
rungs status
# Output shows:
# - Current stack status
# - PR information with GitHub state
# - Local commits ahead of base branch
```

## Implementation Notes

### Branch Naming Algorithm
1. Extract meaningful words from first commit message in PR
2. Convert to kebab-case
3. Add username prefix from configuration
4. Handle collisions with numeric suffix

### GitHub Integration
- Use `gh` CLI for all GitHub operations
- Automatic sync before operations
- Handle GitHub API rate limits gracefully
- Support GitHub Enterprise via `gh` configuration

### State Management
- Track stack state in `~/.config/rungs/{owner}/{repo}/state.json`
- Maintain branch-to-PR mapping
- Sync with GitHub to keep state current
- Simple configuration in `~/.config/rungs/config.json`

This specification reflects the current implemented functionality of the rungs CLI tool, focusing on the core workflow of creating stacked PRs with automatic GitHub synchronization and stack maintenance.
