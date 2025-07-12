import { ConfigManager } from "./config-manager.js";
import { GitManager, GitCommit } from "./git-manager.js";
import { GitHubManager } from "./github-manager.js";
import { output, startGroup, endGroup, logProgress, logSuccess, logWarning, logInfo, logSummary } from "./output-manager.js";

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

    startGroup("Syncing with GitHub", "github");
    
    const config = await this.config.getAll();
    const activePRs: number[] = [];
    const activeBranches: string[] = [];
    const mergedPRs: number[] = [];
    const needsRebase: { prNumber: number, branchName: string, correctBase: string }[] = [];
    
    logProgress("Checking PR status and bases...");
    
    // Check each PR's current status and base on GitHub
    for (let i = 0; i < state.pullRequests.length; i++) {
      const prNumber = state.pullRequests[i];
      const branchName = state.branches[i];
      
      try {
        const status = await this.github.getPullRequestStatus(prNumber);
        
        if (status === "open") {
          // PR is still active, check if its base is correct
          const prDetails = await this.github.getPullRequestByNumber(prNumber);
          const expectedBase = i === 0 ? config.defaultBranch : state.branches[i - 1];
          
          logInfo(`PR #${prNumber}: current base="${prDetails?.base}", expected base="${expectedBase}"`, 1);
          
          if (prDetails && prDetails.base !== expectedBase) {
            // Check if the current base branch exists or was merged/deleted
            const baseExists = await this.branchExistsOnGitHub(prDetails.base);
            logInfo(`Base branch "${prDetails.base}" exists: ${baseExists}`, 1);
            if (!baseExists || prDetails.base !== expectedBase) {
              logInfo(`Adding PR #${prNumber} to rebase queue`, 1);
              needsRebase.push({ prNumber, branchName, correctBase: expectedBase });
            }
          }
          
          activePRs.push(prNumber);
          activeBranches.push(branchName);
        } else if (status === "merged") {
          // Track merged PRs for automatic rebasing
          mergedPRs.push(prNumber);
        }
        // If status is "closed" (not merged), just remove from tracking
      } catch (error) {
        // If we can't check the PR status, assume it's gone
        logWarning(`Could not check status of PR #${prNumber}, removing from tracking`, 1);
      }
    }
    
    // If we have merged PRs and remaining active PRs, automatically fix bases
    if (mergedPRs.length > 0 && activePRs.length > 0) {
      await this.autoRebaseAfterMerges(activePRs, activeBranches);
    }
    
    // Fix any PRs that have incorrect bases
    if (needsRebase.length > 0) {
      await this.fixIncorrectBases(needsRebase);
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
    
    logSuccess("GitHub sync completed");
    endGroup();
  }

  private async branchExistsOnGitHub(branchName: string): Promise<boolean> {
    try {
      // Check if the branch exists on the remote
      await Bun.$`gh api repos/:owner/:repo/branches/${branchName}`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  private async fixIncorrectBases(needsRebase: { prNumber: number, branchName: string, correctBase: string }[]): Promise<void> {
    startGroup(`Fixing Incorrect Bases (${needsRebase.length} PRs)`, "github");
    
    for (const { prNumber, branchName, correctBase } of needsRebase) {
      try {
        logProgress(`Updating PR #${prNumber} (${branchName}) base to ${correctBase}`, 1);
        await this.github.updatePullRequestBase(prNumber, correctBase);
        logSuccess(`Updated PR #${prNumber} base`, 1);
      } catch (error) {
        logWarning(`Could not update base for PR #${prNumber}: ${error}`, 1);
      }
    }
    
    endGroup();
  }

  private async autoRebaseAfterMerges(activePRs: number[], activeBranches: string[]): Promise<void> {
    const config = await this.config.getAll();
    console.log(`Auto-rebasing ${activePRs.length} PRs after merge...`);
    
    // Update base branches for remaining PRs
    for (let i = 0; i < activePRs.length; i++) {
      const prNumber = activePRs[i];
      const newBase = i === 0 ? config.defaultBranch : activeBranches[i - 1];
      
      try {
        console.log(`Updating PR #${prNumber} base to ${newBase}`);
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

  async mergePullRequest(
    prNumber?: number,
    mergeMethod: "squash" | "merge" | "rebase" = "squash",
    deleteBranch: boolean = true
  ): Promise<void> {
    await this.ensurePrerequisites();
    
    // If no PR number provided, find the top PR in the stack
    if (!prNumber) {
      const state = await this.loadState();
      if (state.pullRequests.length === 0) {
        throw new Error("No PRs found in current stack");
      }
      prNumber = state.pullRequests[state.pullRequests.length - 1];
    }
    
    console.log(`Merging PR #${prNumber} using ${mergeMethod} merge...`);
    
    // Merge the PR
    await this.github.mergePullRequest(prNumber, mergeMethod, deleteBranch);
    
    console.log(`✅ Successfully merged PR #${prNumber}`);
    
    // Auto-pull latest changes to keep local main up to date
    console.log("🔄 Updating local main with latest changes...");
    try {
      const config = await this.config.getAll();
      console.log("  🔄 Fetching from remote...");
      console.log("  🔄 Rebasing local changes...");
      await this.git.pullLatestChanges(config.defaultBranch);
      console.log("  ✅ Local main is now up to date");
    } catch (error) {
      console.warn(`  ⚠️ Warning: Could not update local ${config.defaultBranch}: ${error}`);
    }
    
    // Sync state and update remaining PRs (this triggers auto-rebase)
    console.log("Updating stack state...");
    await this.syncWithGitHub();
    
    console.log("Stack state updated successfully!");
  }

  async pushStack(autoPublish: boolean = false, force: boolean = false): Promise<void> {
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

    // Sync validation (unless forced)
    if (!force) {
      await this.validateSyncStatus(config.defaultBranch);
    }

    // Fetch and rebase if configured
    if (config.autoRebase) {
      startGroup("Fetching Latest Changes", "git");
      logProgress("Fetching from origin...");
      await this.git.fetchOrigin();
      logSuccess("Fetched latest changes");
      
      if (status.behind > 0) {
        logProgress(`Rebasing ${status.behind} commits...`);
        await this.git.rebaseOnto(config.defaultBranch);
        logSuccess("Rebase completed");
      }
      endGroup();
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
      logInfo("No new commits to process.");
      return;
    }

    startGroup("Processing Commits", "git");
    logInfo(`Found ${newCommits.length} new commits to process.`);
    
    // List the commits being processed
    const commitList = newCommits.map(c => `${c.hash.slice(0, 7)}: ${c.message}`);
    output.logList(commitList, "Commits to process:", "info");
    endGroup();

    // Check for duplicate PRs with these commits
    startGroup("Checking for Duplicate PRs", "github");
    logProgress("Searching for existing PRs with these commits...");
    
    const commitShas = newCommits.map(c => c.hash);
    const existingPRs = await this.github.findPRsWithCommits(commitShas);
    
    if (existingPRs.length > 0) {
      const existingPR = existingPRs[0]; // Use the first matching PR
      endGroup();
      
      logWarning("❌ These commits already exist in an existing PR");
      logInfo(`PR #${existingPR.number}: ${existingPR.title}`);
      logInfo(`URL: ${existingPR.url}`);
      logInfo(`Status: ${existingPR.status}`);
      logInfo("");
      logInfo("No new PR created. You can:");
      logInfo(`  - Update PR #${existingPR.number} if needed`);
      logInfo("  - Run 'rungs status' to see current PRs");
      return;
    }
    
    logSuccess("No duplicate PRs found");
    endGroup();

    // Create branch for the new commits
    const branchName = this.git.generateBranchName(newCommits, config.userPrefix, config.branchNaming);
    
    // Check if branch already exists
    if (await this.git.branchExists(branchName)) {
      throw new Error(`Branch ${branchName} already exists. Please delete it or use a different naming strategy.`);
    }

    startGroup("Creating Branch", "git");
    logProgress(`Creating branch: ${branchName}`);
    await this.git.createBranch(branchName);
    
    logProgress("Pushing branch to remote...");
    await this.git.pushBranch(branchName);
    logSuccess("Branch created and pushed");
    endGroup();

    startGroup("Creating Pull Request", "github");
    const prTitle = this.github.generatePRTitle(newCommits);
    const prBody = this.github.generatePRBody(newCommits);
    
    // Use the last branch as base for stacking, or default branch for first PR
    const baseBranch = state.lastBranch || config.defaultBranch;
    
    logProgress(`Creating PR: "${prTitle}"`);
    logInfo(`Base branch: ${baseBranch}`, 1);
    logInfo(`Draft mode: ${autoPublish ? "No (published)" : "Yes"}`, 1);
    
    const isDraft = autoPublish ? false : config.draftPRs;
    const pr = await this.github.createPullRequest(
      prTitle,
      prBody,
      branchName,
      baseBranch,
      isDraft
    );

    logSuccess(`Created pull request: ${pr.url}`);
    endGroup();

    startGroup("Finalizing", "stack");
    logProgress("Switching back to main branch...");
    await this.git.checkoutBranch(config.defaultBranch);

    logProgress("Updating stack state...");
    const newState: StackState = {
      lastProcessedCommit: newCommits[0].hash, // Most recent commit
      branches: [...state.branches, branchName],
      pullRequests: [...state.pullRequests, pr.number],
      lastBranch: branchName // Track this branch for next stack
    };
    
    await this.saveState(newState);
    
    logSuccess("Stack state updated");
    endGroup();

    logSummary("Stack Created Successfully", [
      { label: "Branch", value: branchName },
      { label: "Pull Request", value: `#${pr.number}` },
      { label: "URL", value: pr.url }
    ]);
    
    logInfo(`You can now continue working on ${config.defaultBranch} and run 'rungs push' again for additional commits.`);
  }

  async getStatus(): Promise<string> {
    await this.ensurePrerequisites();

    const config = await this.config.getAll();
    const gitStatus = await this.git.getStatus();
    const state = await this.loadState();

    let baseRef: string;
    if (state.lastProcessedCommit && state.pullRequests.length > 0) {
      // Only use lastProcessedCommit if we have active PRs
      baseRef = state.lastProcessedCommit;
    } else {
      // If no active PRs, compare against origin/main
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

  private async validateSyncStatus(defaultBranch: string): Promise<void> {
    startGroup("Validating Sync Status", "git");
    
    try {
      logProgress("Checking sync status with remote...");
      const syncResult = await this.git.getSyncStatus(defaultBranch);
      
      if (syncResult.status === "clean") {
        logSuccess("Local branch is in sync with remote");
        endGroup();
        return;
      }
      
      // Check for duplicate commits (merged commits that appear both locally and remotely)
      const duplicateCheck = await this.git.detectDuplicateCommits(defaultBranch);
      
      let errorMessage = "❌ Cannot create PR: Local branch is out of sync with remote\n\n";
      
      switch (syncResult.status) {
        case "ahead":
          if (duplicateCheck.hasDuplicates) {
            errorMessage += `Your local ${defaultBranch} has ${syncResult.aheadCount} commits that may already be merged into remote.\n`;
            errorMessage += `Duplicate commit messages found:\n${duplicateCheck.duplicateMessages.map(msg => `  - ${msg}`).join('\n')}\n\n`;
            errorMessage += "This would create a PR with merge conflicts.\n\n";
            errorMessage += "To resolve:\n";
            errorMessage += `  git reset --hard origin/${defaultBranch}    # Reset to remote state\n`;
            errorMessage += `  git cherry-pick <specific-commits>         # Re-apply only new commits\n\n`;
            errorMessage += "Or:\n";
            errorMessage += `  git rebase origin/${defaultBranch}         # Rebase on top of remote\n\n`;
          } else {
            // Normal case: ahead with new commits - this is fine for creating PRs!
            logInfo(`Local is ${syncResult.aheadCount} commits ahead with new changes - ready to create PR`);
            endGroup();
            return;
          }
          break;
          
        case "behind":
          errorMessage += `Your local ${defaultBranch} is ${syncResult.behindCount} commits behind remote.\n`;
          errorMessage += "To resolve:\n";
          errorMessage += `  git pull origin ${defaultBranch}            # Pull latest changes\n\n`;
          break;
          
        case "diverged":
          errorMessage += `Your local ${defaultBranch} has diverged from remote:\n`;
          errorMessage += `  - ${syncResult.aheadCount} commits ahead\n`;
          errorMessage += `  - ${syncResult.behindCount} commits behind\n\n`;
          errorMessage += "To resolve:\n";
          errorMessage += `  git rebase origin/${defaultBranch}          # Rebase your changes on top\n`;
          errorMessage += "Or:\n";
          errorMessage += `  git reset --hard origin/${defaultBranch}    # Reset to remote (loses local changes)\n\n`;
          break;
      }
      
      errorMessage += "Use --force to create PR anyway (not recommended)";
      
      endGroup();
      throw new Error(errorMessage);
      
    } catch (error) {
      endGroup();
      if (error instanceof Error && error.message.includes("Cannot create PR")) {
        throw error; // Re-throw sync validation errors as-is
      }
      throw new Error(`Failed to validate sync status: ${error}`);
    }
  }

  async publishPullRequest(prNumber?: number): Promise<void> {
    await this.ensurePrerequisites();
    
    // If no PR number provided, find the top PR in the stack
    if (!prNumber) {
      const state = await this.loadState();
      if (state.pullRequests.length === 0) {
        throw new Error("No PRs found in current stack");
      }
      prNumber = state.pullRequests[state.pullRequests.length - 1];
    }
    
    // Verify the PR is in our stack (for safety)
    const state = await this.loadState();
    if (!state.pullRequests.includes(prNumber)) {
      console.warn(`Warning: PR #${prNumber} is not tracked in current stack, but attempting to publish anyway...`);
    }
    
    await this.github.publishPullRequest(prNumber);
  }
}
