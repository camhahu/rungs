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
Shows current repository and stack status.

```bash
rungs status
```

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
