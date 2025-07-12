# Rungs - Stacked Diffs CLI

> A CLI tool for managing stacked diffs with Git and GitHub, making the workflow feel more native.

Rungs transforms your development workflow by enabling true stacked diffs - create multiple independent pull requests from a series of commits, each building on the previous one. Perfect for breaking down large features into reviewable chunks.

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- Git repository with GitHub remote

### Installation

```bash
# Clone and build
git clone https://github.com/your-username/rungs.git
cd rungs
bun install
bun run build

# Optionally, link globally (if you have Bun's bin in PATH)
bun link
```

### First Steps

```bash
# Configure your user prefix for branch names
rungs config set userPrefix yourname

# Make some commits on your main branch
git add . && git commit -m "Add user authentication"
git add . && git commit -m "Add password validation"

# Create your first stack
rungs push
# Creates PR #1 with both commits

# Make another commit
git add . && git commit -m "Add login form"

# Create another stack
rungs push  
# Creates PR #2 with just the new commit

# Check your stacks
rungs status
```

## 📖 How It Works

Rungs implements a **stacked diffs workflow** that transforms how you manage related changes:

### Traditional Workflow Problems
- Large PRs are hard to review
- Related changes get bundled together
- Difficult to merge parts of a feature independently

### Stacked Diffs Solution
1. **Make incremental commits** on your main branch
2. **Create stacks** - each `rungs push` creates a PR with new commits
3. **Independent review** - each PR can be reviewed and merged separately
4. **Natural progression** - later PRs build on earlier ones

### Example Workflow

```bash
# Start with a clean main branch
git checkout main
git pull origin main

# Implement feature in small, logical commits
git commit -m "Add user model"           # Commit A
git commit -m "Add authentication API"   # Commit B
rungs push                               # → PR #1 (A + B)

git commit -m "Add login UI"             # Commit C  
git commit -m "Add error handling"       # Commit D
rungs push                               # → PR #2 (C + D)

git commit -m "Add user dashboard"       # Commit E
rungs push                               # → PR #3 (E)
```

**Result**: Three focused, reviewable PRs instead of one massive PR with 5 commits.

## 🔄 Complete User Workflow

Here's the full lifecycle of working with stacked diffs, including how to handle PR merges:

### 1. Initial Development
```bash
# Start development on main
git checkout main
git pull origin main

# Make incremental commits
git commit -m "Add user authentication model"
git commit -m "Add password hashing utility"
rungs push                                    # → Creates PR #42

git commit -m "Add login endpoint"
git commit -m "Add JWT token generation"  
rungs push                                    # → Creates PR #43

git commit -m "Add login form component"
rungs push                                    # → Creates PR #44
```

### 2. Review and Merge Process
```bash
# Check current stack status
rungs status
# Shows:
# Active PRs: #42, #43, #44
# Dependencies: #43 builds on #42, #44 builds on #43
```

### 3. When PRs Get Merged
After PR #42 gets merged into main:

```bash
# Any rungs command automatically detects and handles merges
rungs status

# This automatically:
# - Detects PR #42 was merged and removes it from tracking
# - Updates PR #43 to base on main (instead of #42's branch)  
# - Updates PR #44 to base on #43's branch
# - Maintains clean commit history without any manual intervention
```

### 4. Continue Development
```bash
# After rebase, continue working
git commit -m "Add password reset feature"
rungs push                                    # → Creates PR #45

rungs status
# Now shows:
# Active PRs: #43, #44, #45
# Clean dependency chain maintained
```

### 5. Complete Feature Lifecycle
```bash
# As each PR gets reviewed and merged, rungs automatically handles cleanup:

# PR #43 gets merged - next rungs command automatically updates bases
rungs status
# Now PR #44 bases on main, PR #45 bases on #44

# PR #44 gets merged - automatic cleanup again
rungs push  # Any command triggers sync
# Now only PR #45 remains, bases on main

# PR #45 gets merged
rungs status
# Shows: No active PRs, ready for next feature
```

### Key Benefits of This Workflow

**🎯 Focused Reviews**: Each PR contains logically related changes  
**🚀 Parallel Development**: Work on new features while others are in review  
**🔧 Easy Maintenance**: Automatic stack cleanup when PRs are merged  
**📈 Better Velocity**: Merge parts of features as they're ready  
**🔄 Always Current**: Rungs automatically syncs with GitHub on every command

## 🛠️ Commands

### `rungs push`
Creates a new stack (pull request) with uncommitted changes since the last stack.

```bash
rungs push                    # Create stack with default settings
rungs push --help            # Show push command options
```

**What it does:**
- Detects new commits since last stack
- Creates a descriptive branch name based on commit messages
- Pushes branch to GitHub
- Creates a draft pull request
- Updates local state to track the new stack

### `rungs status`
Shows current repository and stack status with real-time GitHub sync.

```bash
rungs status
```

**Features:**
- Automatically syncs with GitHub to show current PR status
- Removes merged/closed PRs from tracking
- Shows accurate count of active PRs and branches
- Displays new commits ready to push

**Example output:**
```
Current Status:
- Branch: main
- Clean: Yes
- Ahead: 3 commits
- Behind: 0 commits

Stack Status:
- Active branches: 2
- Active PRs: 2
- New commits ready: 1

Active Branches:
  - john/add-user-authentication
  - john/add-login-form

Active PRs:
  - #42
  - #43

New Commits (ready to push):
  - a1b2c3d: Add password validation
```

### `rungs config`
Manage rungs configuration settings.

```bash
# View all settings
rungs config list

# Set individual values
rungs config set userPrefix john
rungs config set defaultBranch main
rungs config set draftPRs true
rungs config set autoRebase true
rungs config set branchNaming commit-message

# Get specific value
rungs config get userPrefix
```

### `rungs help`
Show help information for rungs and its commands.

```bash
rungs help                   # General help
rungs help push             # Help for push command
rungs --help                # Same as rungs help
```

## ⚙️ Configuration

Rungs stores configuration in `~/.rungs/config.json`. You can customize:

| Setting | Default | Description |
|---------|---------|-------------|
| `userPrefix` | `"dev"` | Prefix for branch names (e.g., `john/feature-branch`) |
| `defaultBranch` | `"main"` | Base branch for comparisons and rebasing |
| `draftPRs` | `true` | Create PRs as drafts by default |
| `autoRebase` | `true` | Automatically rebase on remote changes |
| `branchNaming` | `"commit-message"` | Strategy for branch names: `commit-message`, `sequential`, `timestamp` |

### Branch Naming Strategies

- **`commit-message`** (default): `john/add-user-authentication`
- **`sequential`**: `john/stack-1640995200000`  
- **`timestamp`**: `john/2023-01-01T12-00-00`

## 🔧 Advanced Usage

### Working with Multiple Features

```bash
# Feature A
git commit -m "Add user model"
git commit -m "Add user tests" 
rungs push                           # PR #1

# Feature B (separate from A)
git commit -m "Add payment system"
rungs push                           # PR #2

# Continue Feature A
git commit -m "Add user validation"
rungs push                           # PR #3 (builds on PR #1)
```

### Integration with Code Review

1. **Create stacks** with `rungs push`
2. **Review PRs independently** - reviewers can focus on one logical change
3. **Merge in order** - later PRs automatically rebase on earlier ones
4. **Iterate easily** - make changes to individual stacks without affecting others

### Handling Merge Conflicts

When rebasing fails due to conflicts:

```bash
# Rungs will abort the rebase automatically
git status                    # See conflicted files
# Resolve conflicts manually
git add .
git rebase --continue
rungs push                    # Continue with stack creation
```

## 🧪 Development

### Setup

```bash
bun install                  # Install dependencies
bun run build               # Build the CLI
bun test                    # Run tests
```

### Development Commands

```bash
bun run dev                 # Run in development mode  
bun run cli                 # Run CLI locally
bun run cli -- push        # Run local CLI with arguments
bun test                    # Run test suite
bun test tests/regression.test.ts  # Run specific tests
```

### Project Structure

```
rungs/
├── src/
│   ├── cli.ts              # CLI entry point and command parsing
│   ├── git-manager.ts      # Git operations (commits, branches, etc.)
│   ├── github-manager.ts   # GitHub API via gh CLI
│   ├── stack-manager.ts    # Core stacking logic
│   └── config-manager.ts   # Configuration management
├── tests/                  # Test suite
├── docs/                   # Documentation and specs
└── bin/rungs              # Built CLI executable
```

### Testing Philosophy

Every bug fix includes regression tests. See [AGENT.md](./AGENT.md) for testing guidelines.

Run tests before submitting changes:
```bash
bun test                    # All tests
bun test --watch           # Watch mode for development
```

## 🤝 Contributing

1. **Fork and clone** the repository
2. **Create a feature branch** for your changes
3. **Write tests** for any new functionality
4. **Run the test suite** to ensure nothing breaks
5. **Submit a pull request** with a clear description

### Code Style

- Use TypeScript for type safety
- Follow existing patterns for error handling
- Add JSDoc comments for public APIs
- Include regression tests for bug fixes

## 📚 Examples

### Example 1: Feature Development

```bash
# Scenario: Building a user authentication system

# Step 1: Core functionality
git commit -m "Add User model with basic fields"
git commit -m "Add password hashing utility"
git commit -m "Add user registration endpoint"
rungs push  # → PR #1: "Add User model with basic fields (+2 more)"

# Step 2: Authentication logic  
git commit -m "Add JWT token generation"
git commit -m "Add login endpoint"
git commit -m "Add middleware for auth verification"
rungs push  # → PR #2: "Add JWT token generation (+2 more)"

# Step 3: Frontend integration
git commit -m "Add login form component"
git commit -m "Add authentication context"
rungs push  # → PR #3: "Add login form component (+1 more)"
```

**Benefits:**
- PR #1 can be reviewed for data modeling
- PR #2 can be reviewed for security implementation  
- PR #3 can be reviewed for UI/UX
- Each can be merged independently as ready

### Example 2: Bug Fix Series

```bash
# Scenario: Fixing a complex performance issue

git commit -m "Add performance monitoring to API"
rungs push  # → PR #1: Quick monitoring addition

git commit -m "Optimize database queries in user lookup"  
git commit -m "Add query result caching"
rungs push  # → PR #2: Database optimizations

git commit -m "Update API documentation with performance notes"
rungs push  # → PR #3: Documentation update
```

### Example 3: Complete Stack Lifecycle with Automatic Cleanup

```bash
# Scenario: Feature development with seamless PR merges

# Initial development
git commit -m "Add payment model"
git commit -m "Add payment validation"
rungs push  # → PR #10: Payment foundation

git commit -m "Add payment API endpoints"  
git commit -m "Add error handling"
rungs push  # → PR #11: Payment API (builds on PR #10)

git commit -m "Add payment UI components"
rungs push  # → PR #12: Payment UI (builds on PR #11)

# Check stack status
rungs status
# Active PRs: #10, #11, #12
# Dependencies: #11 → #10, #12 → #11

# PR #10 gets approved and merged (on GitHub)
# Next rungs command automatically detects and handles it
rungs status
# Automatically updates: #11 now bases on main, #12 bases on #11

# Continue development while others are in review
git commit -m "Add payment analytics"
rungs push  # → PR #13: Analytics (builds on PR #12)

# PR #11 gets merged (on GitHub)
rungs push  # Any command triggers automatic cleanup
# Automatically updates: #12 now bases on main, #13 bases on #12

# Final state: Clean stack with no duplicate commits
rungs status
# Active PRs: #12, #13
# All PRs have clean, focused commits
```

**Benefits:**
- Clean commit history throughout the process
- Zero manual intervention required for stack maintenance
- Each PR remains focused and reviewable  
- Team can merge PRs as they're ready without coordination

## 🛡️ Troubleshooting

### Common Issues

**"Not in a git repository"**
```bash
# Ensure you're in a git repository
git init
git remote add origin <your-repo-url>
```

**"GitHub CLI not authenticated"**  
```bash
# Authenticate with GitHub
gh auth login
```

**"Working directory is not clean"**
```bash
# Commit or stash your changes first
git add . && git commit -m "Your changes"
# or
git stash
```

**"Failed to create pull request"**
- Check that your GitHub repository exists
- Ensure you have push permissions
- Verify GitHub CLI is properly authenticated

### Debug Mode

For troubleshooting, use verbose output:
```bash
rungs push --verbose        # Show detailed execution info
rungs status --verbose      # Detailed status information  
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with [Bun](https://bun.sh) for fast, modern JavaScript runtime and [GitHub CLI](https://cli.github.com/) for seamless GitHub integration.

---

**Happy stacking! 🥞**

## 🚧 Development Status

Rungs is under active development. Current features are stable and tested through dogfooding on this repository itself. All development work uses rungs to create and manage PRs, ensuring real-world testing of every feature.
