# 🥞 Rungs - Stacked Diffs CLI

> 🚀 A CLI tool for managing stacked diffs with Git and GitHub

Break down large features into reviewable chunks! Create multiple independent pull requests from a series of commits, each building on the previous one.

## ✨ Quick Start

### Prerequisites
- 🏃‍♂️ [Bun](https://bun.sh) runtime
- 🐙 [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- 📂 Git repository with GitHub remote

### Installation

> **Note**: This section includes commit A changes for testing stacking workflow.
> **First Change**: Testing commit A
> **Fix Test**: New commit A for testing the fix
> **Final Test**: Testing the final fix - Commit A
> **Working Fix Test A**: Testing working fix - First commit
```bash
git clone https://github.com/camhahu/rungs.git
cd rungs
bun install && bun run build
```

### First Stack
```bash
# Configure your prefix
rungs config set userPrefix yourname

# Make some commits
git commit -m "Add user authentication"
git commit -m "Add password validation"

# Create your first stack! 🎉
rungs stack

# Make another commit and stack again
git commit -m "Add login form"
rungs stack

# Check your stacks
rungs status
```

## 🎯 How It Works

### Traditional Problem 😫
- Large PRs are hard to review
- Related changes get bundled together
- Difficult to merge parts of a feature independently

### Stacked Diffs Solution ✨
1. **Make incremental commits** on your main branch
2. **Create stacks** - each `rungs stack` creates a PR with new commits
3. **Independent review** - each PR can be reviewed and merged separately
4. **Automatic cleanup** - when PRs merge, rungs updates everything automatically

### Example Workflow 📝
```bash
git commit -m "Add user model"           # Commit A
git commit -m "Add authentication API"   # Commit B
rungs stack                              # → PR #1 (A + B)

git commit -m "Add login UI"             # Commit C  
git commit -m "Add error handling"       # Commit D
rungs stack                              # → PR #2 (C + D)

git commit -m "Add user dashboard"       # Commit E
rungs stack                              # → PR #3 (E)
```

**Result**: Three focused, reviewable PRs instead of one massive PR! 🎊

## 🛠️ Commands

### `rungs stack` 
🚀 Create a new stack with your latest commits
```bash
rungs stack                   # Create stack with new commits
rungs stack --auto-publish    # Create as published (not draft)
rungs stack --force           # Stack even if behind remote
```

### `rungs status`
📊 Show current repository and stack status
```bash
rungs status
```

### `rungs publish`
✅ Mark PR as ready for review (remove draft status)
```bash
rungs publish         # Publish top PR in stack
rungs publish 123     # Publish specific PR #123
```

### `rungs merge`
🔀 Merge a PR and update the stack
```bash
rungs merge 123              # Merge PR #123 (squash)
rungs merge 123 --merge      # Merge commit
rungs merge 123 --rebase     # Rebase merge
```

> **🎯 Smart Stack Management**: Automatically updates dependent PRs before merging to prevent GitHub auto-closure. Your stack stays intact with correct diffs!

> **✅ Fix Verified**: The built binary now includes the stacking bug fix.

### `rungs config`
⚙️ Manage configuration
```bash
rungs config list                    # Show all settings
rungs config set userPrefix john     # Set branch prefix
rungs config get userPrefix          # Get a setting
```

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `userPrefix` | `"dev"` | 🏷️ Prefix for branch names |
| `defaultBranch` | `"main"` | 🌿 Base branch for operations |
| `draftPRs` | `true` | 📝 Create PRs as drafts by default |
| `autoRebase` | `true` | 🔄 Auto-rebase on remote changes |

## 🎉 Benefits

- 🎯 **Focused Reviews** - Each PR contains logically related changes
- 🚀 **Parallel Development** - Work on new features while others are in review
- 🔧 **Easy Maintenance** - Automatic stack cleanup when PRs are merged
- 📈 **Better Velocity** - Merge parts of features as they're ready
- 🔄 **Always Current** - Auto-syncs with GitHub on every command

## 🧪 Development

```bash
bun install          # 📦 Install dependencies
bun run build        # 🔨 Build the CLI
bun test             # 🧪 Run tests
bun run cli          # 🏃‍♂️ Run CLI locally
```

## 🤝 Contributing

1. 🍴 Fork and clone the repository
2. 🌿 Create a feature branch for your changes
3. 🧪 Write tests for any new functionality
4. ✅ Run the test suite to ensure nothing breaks
5. 📬 Submit a pull request with a clear description

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Happy stacking! 🥞✨**
