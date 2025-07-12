import { ConfigManager } from "./config-manager.js";
import { GitManager, GitCommit } from "./git-manager.js";
import { GitHubManager } from "./github-manager.js";

interface StackState {
  lastProcessedCommit?: string;
  branches: string[];
  pullRequests: number[];
  lastBranch?: string; // Track the previous branch for stacking
}

export class StackManager {
  private stateFile: string;

  constructor(
    private config: ConfigManager,
    private git: GitManager,
    private github: GitHubManager
  ) {
    this.stateFile = ".rungs-state.json";
  }

  async ensurePrerequisites(): Promise<void> {
    // Check if we're in a git repository
    if (!(await this.git.isGitRepo())) {
      throw new Error("Not in a git repository. Run 'git init' to initialize a repository.");
    }

    // Check if GitHub CLI is available and authenticated
    if (!(await this.github.isGitHubCLIAvailable())) {
      throw new Error("GitHub CLI (gh) is not installed or not in PATH. Install from https://cli.github.com/");
    }

    if (!(await this.github.isAuthenticated())) {
      throw new Error("Not authenticated with GitHub CLI. Run 'gh auth login' to authenticate.");
    }

    // Always sync with GitHub to ensure state is current
    await this.syncWithGitHub();
  }

  async syncWithGitHub(): Promise<void> {
    const state = await this.loadState();
    
    if (state.pullRequests.length === 0) {
      return; // Nothing to sync
    }

    const activePRs: number[] = [];
    const activeBranches: string[] = [];
    const mergedPRs: number[] = [];
    
    // Check each PR's current status on GitHub
    for (let i = 0; i < state.pullRequests.length; i++) {
      const prNumber = state.pullRequests[i];
      const branchName = state.branches[i];
      
      try {
        const status = await this.github.getPullRequestStatus(prNumber);
        
        if (status === "open") {
          // PR is still active, keep it
          activePRs.push(prNumber);
          activeBranches.push(branchName);
        } else if (status === "merged") {
          // Track merged PRs for automatic rebasing
          mergedPRs.push(prNumber);
        }
        // If status is "closed" (not merged), just remove from tracking
      } catch (error) {
        // If we can't check the PR status, assume it's gone
        console.warn(`Warning: Could not check status of PR #${prNumber}, removing from tracking`);
      }
    }
    
    // If we have merged PRs and remaining active PRs, automatically rebase
    if (mergedPRs.length > 0 && activePRs.length > 0) {
      await this.autoRebaseAfterMerges(activePRs, activeBranches);
    }
    
    // Update state with only active PRs
    const syncedState: StackState = {
      ...state,
      pullRequests: activePRs,
      branches: activeBranches,
      lastBranch: activeBranches.length > 0 ? activeBranches[activeBranches.length - 1] : undefined
    };
    
    // Save the synced state
    await this.saveState(syncedState);
  }

  private async autoRebaseAfterMerges(activePRs: number[], activeBranches: string[]): Promise<void> {
    // Update base branches for remaining PRs
    for (let i = 0; i < activePRs.length; i++) {
      const prNumber = activePRs[i];
      const newBase = i === 0 ? "main" : activeBranches[i - 1];
      
      try {
        await this.github.updatePullRequestBase(prNumber, newBase);
      } catch (error) {
        console.warn(`Warning: Could not update base for PR #${prNumber}: ${error}`);
      }
    }
  }

  async loadState(): Promise<StackState> {
    try {
      const file = Bun.file(this.stateFile);
      if (!(await file.exists())) {
        return { branches: [], pullRequests: [] };
      }
      
      const content = await file.text();
      const state = JSON.parse(content);
      // Ensure backward compatibility with existing state files
      return { branches: [], pullRequests: [], ...state };
    } catch {
      return { branches: [], pullRequests: [] };
    }
  }

  async saveState(state: StackState): Promise<void> {
    try {
      await Bun.write(this.stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      throw new Error(`Failed to save state: ${error}`);
    }
  }

  async pushStack(): Promise<void> {
    await this.ensurePrerequisites();

    const config = await this.config.getAll();
    const currentBranch = await this.git.getCurrentBranch();
    
    // Ensure we're on the default branch
    if (currentBranch !== config.defaultBranch) {
      throw new Error(`Must be on ${config.defaultBranch} branch to push stack. Currently on ${currentBranch}.`);
    }

    // Check if working directory is clean
    const status = await this.git.getStatus();
    if (!status.isClean) {
      throw new Error("Working directory is not clean. Please commit or stash changes.");
    }

    // Fetch and rebase if configured
    if (config.autoRebase) {
      console.log("Fetching latest changes...");
      await this.git.fetchOrigin();
      
      if (status.behind > 0) {
        console.log(`Rebasing ${status.behind} commits...`);
        await this.git.rebaseOnto(config.defaultBranch);
      }
    }

    // Load previous state
    const state = await this.loadState();
    
    // Get commits since last processed or since origin/main
    let baseRef: string;
    if (state.lastProcessedCommit) {
      baseRef = state.lastProcessedCommit;
    } else {
      // For first run, check if origin branch exists, otherwise use a reasonable base
      try {
        await Bun.$`git rev-parse --verify origin/${config.defaultBranch}`.quiet();
        baseRef = `origin/${config.defaultBranch}`;
      } catch {
        // Origin branch doesn't exist, get all commits on current branch
        // Find the root commit or use a reasonable base
        try {
          const rootCommit = await Bun.$`git rev-list --max-parents=0 HEAD`.text();
          baseRef = rootCommit.trim();
        } catch {
          // If all else fails, just get the last few commits
          baseRef = `HEAD~10`; // Arbitrary limit to avoid too many commits
        }
      }
    }
    
    const newCommits = await this.git.getCommitsSince(baseRef);
    
    if (newCommits.length === 0) {
      console.log("No new commits to process.");
      return;
    }

    console.log(`Found ${newCommits.length} new commits to process.`);

    // Create branch for the new commits
    const branchName = this.git.generateBranchName(newCommits, config.userPrefix, config.branchNaming);
    
    // Check if branch already exists
    if (await this.git.branchExists(branchName)) {
      throw new Error(`Branch ${branchName} already exists. Please delete it or use a different naming strategy.`);
    }

    // Create and push branch
    console.log(`Creating branch: ${branchName}`);
    await this.git.createBranch(branchName);
    await this.git.pushBranch(branchName);

    // Create pull request
    console.log("Creating pull request...");
    const prTitle = this.github.generatePRTitle(newCommits);
    const prBody = this.github.generatePRBody(newCommits);
    
    // Use the last branch as base for stacking, or default branch for first PR
    const baseBranch = state.lastBranch || config.defaultBranch;
    
    const pr = await this.github.createPullRequest(
      prTitle,
      prBody,
      branchName,
      baseBranch,
      config.draftPRs
    );

    console.log(`Created pull request: ${pr.url}`);

    // Switch back to main branch
    await this.git.checkoutBranch(config.defaultBranch);

    // Update state
    const newState: StackState = {
      lastProcessedCommit: newCommits[0].hash, // Most recent commit
      branches: [...state.branches, branchName],
      pullRequests: [...state.pullRequests, pr.number],
      lastBranch: branchName // Track this branch for next stack
    };
    
    await this.saveState(newState);

    console.log(`
Stack created successfully!
- Branch: ${branchName}
- Pull Request: #${pr.number}
- URL: ${pr.url}

You can now continue working on ${config.defaultBranch} and run 'rungs push' again for additional commits.
    `);
  }

  async getStatus(): Promise<string> {
    await this.ensurePrerequisites();

    const config = await this.config.getAll();
    const gitStatus = await this.git.getStatus();
    const state = await this.loadState();

    let baseRef: string;
    if (state.lastProcessedCommit) {
      baseRef = state.lastProcessedCommit;
    } else {
      try {
        await Bun.$`git rev-parse --verify origin/${config.defaultBranch}`.quiet();
        baseRef = `origin/${config.defaultBranch}`;
      } catch {
        try {
          const rootCommit = await Bun.$`git rev-list --max-parents=0 HEAD`.text();
          baseRef = rootCommit.trim();
        } catch {
          baseRef = `HEAD~10`;
        }
      }
    }
    
    const newCommits = await this.git.getCommitsSince(baseRef);

    let statusMessage = `
Current Status:
- Branch: ${gitStatus.currentBranch}
- Clean: ${gitStatus.isClean ? "Yes" : "No"}
- Ahead: ${gitStatus.ahead} commits
- Behind: ${gitStatus.behind} commits

Stack Status:
- Active branches: ${state.branches.length}
- Active PRs: ${state.pullRequests.length}
- New commits ready: ${newCommits.length}
`;

    if (state.branches.length > 0) {
      statusMessage += `\nActive Branches:\n${state.branches.map(b => `  - ${b}`).join('\n')}`;
    }

    if (state.pullRequests.length > 0) {
      statusMessage += `\nActive PRs:\n${state.pullRequests.map(pr => `  - #${pr}`).join('\n')}`;
    }

    if (newCommits.length > 0) {
      statusMessage += `\nNew Commits (ready to push):\n${newCommits.map(c => `  - ${c.hash.slice(0, 7)}: ${c.message}`).join('\n')}`;
    }

    return statusMessage;
  }

  async rebaseStack(mergedPrNumber: number): Promise<void> {
    await this.ensurePrerequisites();

    const state = await this.loadState();
    
    // Find the index of the merged PR
    const mergedPrIndex = state.pullRequests.indexOf(mergedPrNumber);
    if (mergedPrIndex === -1) {
      throw new Error(`PR #${mergedPrNumber} not found in active stack`);
    }

    // Get the branch that was merged
    const mergedBranch = state.branches[mergedPrIndex];
    
    // Update base branches for all PRs that come after the merged one
    for (let i = mergedPrIndex + 1; i < state.pullRequests.length; i++) {
      const prNumber = state.pullRequests[i];
      const newBase = i === mergedPrIndex + 1 ? "main" : state.branches[i - 1];
      
      console.log(`Updating PR #${prNumber} base to ${newBase}`);
      await this.github.updatePullRequestBase(prNumber, newBase);
    }

    // Remove the merged PR and branch from state
    const newState: StackState = {
      ...state,
      branches: state.branches.filter((_, index) => index !== mergedPrIndex),
      pullRequests: state.pullRequests.filter((_, index) => index !== mergedPrIndex),
      lastBranch: mergedPrIndex === 0 ? undefined : state.branches[mergedPrIndex - 1]
    };

    await this.saveState(newState);

    console.log(`Removed merged PR #${mergedPrNumber} and updated stack bases`);
  }
}
