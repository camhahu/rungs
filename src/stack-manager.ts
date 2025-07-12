import { ConfigManager } from "./config-manager.js";
import { GitManager, GitCommit } from "./git-manager.js";
import { GitHubManager } from "./github-manager.js";

interface StackState {
  lastProcessedCommit?: string;
  branches: string[];
  pullRequests: number[];
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
      throw new Error("Not in a git repository");
    }

    // Check if GitHub CLI is available and authenticated
    if (!(await this.github.isGitHubCLIAvailable())) {
      throw new Error("GitHub CLI (gh) is not installed or not in PATH");
    }

    if (!(await this.github.isAuthenticated())) {
      throw new Error("Not authenticated with GitHub CLI. Run 'gh auth login' first.");
    }
  }

  async loadState(): Promise<StackState> {
    try {
      const file = Bun.file(this.stateFile);
      if (!(await file.exists())) {
        return { branches: [], pullRequests: [] };
      }
      
      const content = await file.text();
      return JSON.parse(content);
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
    
    const pr = await this.github.createPullRequest(
      prTitle,
      prBody,
      branchName,
      config.defaultBranch,
      config.draftPRs
    );

    console.log(`Created pull request: ${pr.url}`);

    // Switch back to main branch
    await this.git.checkoutBranch(config.defaultBranch);

    // Update state
    const newState: StackState = {
      lastProcessedCommit: newCommits[0].hash, // Most recent commit
      branches: [...state.branches, branchName],
      pullRequests: [...state.pullRequests, pr.number]
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
}
