import { ConfigManager } from "./config-manager.js";
import { GitManager, GitCommit } from "./git-manager.js";
import { GitHubManager, PullRequest } from "./github-manager.js";
import { output, startGroup, endGroup, logProgress, logSuccess, logWarning, logInfo, logSummary } from "./output-manager.js";

export interface StackPR {
  number: number;
  branch: string;
  title: string;
  url: string;
  base: string;
  head: string;
  commits?: GitCommit[];
}

export interface StackState {
  prs: StackPR[];
  totalCommits: number;
  lastBranch?: string;
}

/**
 * GitHub-first StackManager that uses GitHub as the single source of truth.
 * Eliminates local state files and discovers stack information from GitHub.
 */
export class StackManager {
  constructor(
    private config: ConfigManager,
    private git: GitManager,
    private github: GitHubManager
  ) {}

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
  }

  /**
   * Discover current stack state from GitHub by finding open PRs
   * and building the topological order from base->head chains.
   */
  async getCurrentStack(): Promise<StackState> {
    startGroup("Discovering Stack from GitHub", "github");
    
    try {
      const config = await this.config.getAll();
      logProgress("Fetching open PRs...");
      
      // Get all open PRs authored by current user
      const result = await Bun.$`gh pr list --author @me --state open --json number,title,url,headRefName,baseRefName`.text();
      const allPRs = JSON.parse(result) as Array<{
        number: number;
        title: string;
        url: string;
        headRefName: string;
        baseRefName: string;
      }>;
      
      // Filter PRs by user prefix to identify stack PRs
      const stackPRs = allPRs.filter(pr => 
        pr.headRefName.startsWith(config.userPrefix + "/")
      );
      
      logInfo(`Found ${stackPRs.length} stack PRs out of ${allPRs.length} total open PRs`, 1);
      
      if (stackPRs.length === 0) {
        endGroup();
        return { prs: [], totalCommits: 0 };
      }
      
      logProgress("Building stack order from base chains...");
      
      // Build topological order by following base->head chains
      const orderedPRs = this.buildStackOrder(stackPRs, config.defaultBranch);
      
      logProgress("Validating and auto-fixing broken chains...");
      
      // Auto-fix any broken base chains
      const fixedPRs = await this.autoFixBrokenChains(orderedPRs, config.defaultBranch);
      
      const stackState: StackState = {
        prs: fixedPRs.map(pr => ({
          number: pr.number,
          branch: pr.headRefName,
          title: pr.title,
          url: pr.url,
          base: pr.baseRefName,
          head: pr.headRefName
        })),
        totalCommits: 0, // Will be calculated when needed
        lastBranch: fixedPRs.length > 0 ? fixedPRs[fixedPRs.length - 1].headRefName : undefined
      };
      
      logSuccess(`Stack discovered: ${fixedPRs.length} PRs in order`);
      
      // Log the stack order
      if (fixedPRs.length > 0) {
        const stackOrder = fixedPRs.map((pr, i) => 
          `${i + 1}. PR #${pr.number}: ${pr.headRefName} <- ${pr.baseRefName}`
        );
        output.logList(stackOrder, "Stack Order:", "info");
      }
      
      endGroup();
      return stackState;
      
    } catch (error) {
      endGroup();
      throw new Error(`Failed to discover stack from GitHub: ${error}`);
    }
  }

  /**
   * Get new commits that aren't in origin/main or existing stack branches.
   * Uses git ranges to find commits ready to be pushed.
   */
  async getNewCommits(): Promise<GitCommit[]> {
    startGroup("Finding New Commits", "git");
    
    try {
      const config = await this.config.getAll();
      const currentStack = await this.getCurrentStack();
      
      logProgress("Determining base reference...");
      
      // Build exclusion list: origin/main + all existing stack branches
      const exclusions = [`origin/${config.defaultBranch}`];
      
      // Add existing stack branches to exclusions
      for (const pr of currentStack.prs) {
        exclusions.push(`origin/${pr.branch}`);
      }
      
      logInfo(`Excluding commits from: ${exclusions.join(", ")}`, 1);
      
      // Find commits that are on HEAD but not in any of the excluded refs
      logProgress("Scanning for new commits...");
      
      let newCommits: GitCommit[] = [];
      
      // Try different strategies to find new commits
      for (const exclusion of exclusions) {
        try {
          // Check if this ref exists
          await Bun.$`git rev-parse --verify ${exclusion}`.quiet();
          
          // Get commits since this ref
          const commitsFromThisRef = await this.git.getCommitsSince(exclusion);
          
          if (commitsFromThisRef.length > 0) {
            // Use the ref that gives us the smallest set of new commits
            // (most recent starting point)
            if (newCommits.length === 0 || commitsFromThisRef.length < newCommits.length) {
              newCommits = commitsFromThisRef;
              logInfo(`Using ${exclusion} as base (${commitsFromThisRef.length} new commits)`, 1);
            }
          }
        } catch {
          // This ref doesn't exist, skip it
          continue;
        }
      }
      
      // If no exclusions worked, fall back to just origin/main
      if (newCommits.length === 0) {
        try {
          newCommits = await this.git.getCommitsSince(`origin/${config.defaultBranch}`);
          logInfo(`Falling back to origin/${config.defaultBranch}`, 1);
        } catch {
          // Last resort: get commits from a reasonable base
          try {
            const rootCommit = await Bun.$`git rev-list --max-parents=0 HEAD`.text();
            const baseRef = rootCommit.trim().split('\n')[0];
            newCommits = await this.git.getCommitsSince(baseRef);
            logInfo(`Using root commit as base`, 1);
          } catch {
            newCommits = [];
          }
        }
      }
      
      logSuccess(`Found ${newCommits.length} new commits`);
      
      if (newCommits.length > 0) {
        const commitList = newCommits.map(c => `${c.hash.slice(0, 7)}: ${c.message}`);
        output.logList(commitList, "New commits:", "info");
      }
      
      endGroup();
      return newCommits;
      
    } catch (error) {
      endGroup();
      throw new Error(`Failed to find new commits: ${error}`);
    }
  }

  /**
   * Build topological order from GitHub PRs by following base->head chains.
   */
  private buildStackOrder(
    prs: Array<{ number: number; title: string; url: string; headRefName: string; baseRefName: string }>,
    defaultBranch: string
  ): Array<{ number: number; title: string; url: string; headRefName: string; baseRefName: string }> {
    const orderedPRs: Array<{ number: number; title: string; url: string; headRefName: string; baseRefName: string }> = [];
    const remaining = [...prs];
    
    // Start with PRs that are based on the default branch
    let currentBase = defaultBranch;
    
    while (remaining.length > 0) {
      const nextPR = remaining.find(pr => pr.baseRefName === currentBase);
      
      if (!nextPR) {
        // No PR found with current base, look for any remaining PR and warn about broken chain
        if (remaining.length > 0) {
          logWarning(`Broken chain detected: ${remaining.length} PRs don't follow proper base chain`, 1);
          // Add remaining PRs in their current order (will be fixed by auto-fix)
          orderedPRs.push(...remaining);
        }
        break;
      }
      
      // Add this PR to the ordered list and remove from remaining
      orderedPRs.push(nextPR);
      remaining.splice(remaining.indexOf(nextPR), 1);
      
      // Next PR should be based on this PR's head
      currentBase = nextPR.headRefName;
    }
    
    return orderedPRs;
  }

  /**
   * Auto-fix broken base chains by updating PR bases to create proper stack order.
   */
  private async autoFixBrokenChains(
    prs: Array<{ number: number; title: string; url: string; headRefName: string; baseRefName: string }>,
    defaultBranch: string
  ): Promise<Array<{ number: number; title: string; url: string; headRefName: string; baseRefName: string }>> {
    const fixedPRs = [...prs];
    const needsFixing: Array<{ prNumber: number; currentBase: string; correctBase: string }> = [];
    
    // Check each PR's base and identify fixes needed
    for (let i = 0; i < fixedPRs.length; i++) {
      const pr = fixedPRs[i];
      const expectedBase = i === 0 ? defaultBranch : fixedPRs[i - 1].headRefName;
      
      if (pr.baseRefName !== expectedBase) {
        needsFixing.push({
          prNumber: pr.number,
          currentBase: pr.baseRefName,
          correctBase: expectedBase
        });
        
        // Update our local copy for consistent ordering
        fixedPRs[i] = { ...pr, baseRefName: expectedBase };
      }
    }
    
    // Apply fixes to GitHub
    if (needsFixing.length > 0) {
      startGroup(`Auto-fixing ${needsFixing.length} broken base chains`, "github");
      
      for (const fix of needsFixing) {
        try {
          logProgress(`Updating PR #${fix.prNumber}: ${fix.currentBase} -> ${fix.correctBase}`, 1);
          await this.github.updatePullRequestBase(fix.prNumber, fix.correctBase);
          logSuccess(`Fixed PR #${fix.prNumber} base`, 1);
        } catch (error) {
          logWarning(`Could not fix PR #${fix.prNumber} base: ${error}`, 1);
        }
      }
      
      endGroup();
    }
    
    return fixedPRs;
  }

  /**
   * Push new commits as a stacked PR.
   */
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

    // Get new commits using the GitHub-first approach
    const newCommits = await this.getNewCommits();
    
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
    
    // Get current stack to determine base branch
    const currentStack = await this.getCurrentStack();
    const baseBranch = currentStack.lastBranch || config.defaultBranch;
    
    logProgress(`Creating PR: "${prTitle}"`);
    logInfo(`Base branch: ${baseBranch}`, 1);
    
    const isDraft = autoPublish ? false : config.draftPRs;
    logInfo(`Draft mode: ${isDraft ? "Yes" : "No (published)"}`, 1);
    
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
    logSuccess("Returned to main branch");
    endGroup();

    logSummary("Stack Created Successfully", [
      { label: "Branch", value: branchName },
      { label: "Pull Request", value: `#${pr.number}` },
      { label: "URL", value: pr.url }
    ]);
    
    logInfo(`You can now continue working on ${config.defaultBranch} and run 'rungs push' again for additional commits.`);
  }

  /**
   * Get current status using GitHub as source of truth.
   */
  async getStatus(): Promise<string> {
    await this.ensurePrerequisites();

    const config = await this.config.getAll();
    const gitStatus = await this.git.getStatus();
    const currentStack = await this.getCurrentStack();
    const newCommits = await this.getNewCommits();

    let statusMessage = `
Current Status:
- Branch: ${gitStatus.currentBranch}
- Clean: ${gitStatus.isClean ? "Yes" : "No"}
- Ahead: ${gitStatus.ahead} commits
- Behind: ${gitStatus.behind} commits

Stack Status (from GitHub):
- Active PRs: ${currentStack.prs.length}
- New commits ready: ${newCommits.length}
`;

    if (currentStack.prs.length > 0) {
      statusMessage += `\nActive PRs (in stack order):\n${currentStack.prs.map((pr, i) => 
        `  ${i + 1}. #${pr.number}: ${pr.branch} <- ${pr.base}`
      ).join('\n')}`;
    }

    if (newCommits.length > 0) {
      statusMessage += `\nNew Commits (ready to push):\n${newCommits.map(c => 
        `  - ${c.hash.slice(0, 7)}: ${c.message}`
      ).join('\n')}`;
    }

    return statusMessage;
  }

  /**
   * Merge a PR and auto-update the stack.
   */
  async mergePullRequest(
    prNumber?: number,
    mergeMethod: "squash" | "merge" | "rebase" = "squash",
    deleteBranch: boolean = true
  ): Promise<void> {
    await this.ensurePrerequisites();
    
    // If no PR number provided, find the top PR in the stack
    if (!prNumber) {
      const currentStack = await this.getCurrentStack();
      if (currentStack.prs.length === 0) {
        throw new Error("No PRs found in current stack");
      }
      prNumber = currentStack.prs[currentStack.prs.length - 1].number;
    }
    
    logInfo(`Merging PR #${prNumber} using ${mergeMethod} merge...`);
    
    // Merge the PR
    await this.github.mergePullRequest(prNumber, mergeMethod, deleteBranch);
    
    logSuccess(`✅ Successfully merged PR #${prNumber}`);
    
    // Auto-pull latest changes to keep local main up to date
    logInfo("🔄 Updating local main with latest changes...");
    try {
      const config = await this.config.getAll();
      logInfo("  🔄 Fetching from remote...");
      logInfo("  🔄 Rebasing local changes...");
      await this.git.pullLatestChanges(config.defaultBranch);
      logInfo("  ✅ Local main is now up to date");
    } catch (error) {
      const config = await this.config.getAll();
      logWarning(`  ⚠️ Warning: Could not update local ${config.defaultBranch}: ${error}`);
    }
    
    // Re-discover stack from GitHub (this will auto-fix remaining PRs)
    logInfo("Updating stack state from GitHub...");
    await this.getCurrentStack(); // This triggers auto-fix of broken chains
    
    logInfo("Stack state updated successfully!");
  }

  /**
   * Publish a draft PR.
   */
  async publishPullRequest(prNumber?: number): Promise<void> {
    await this.ensurePrerequisites();
    
    // If no PR number provided, find the top PR in the stack
    if (!prNumber) {
      const currentStack = await this.getCurrentStack();
      if (currentStack.prs.length === 0) {
        throw new Error("No PRs found in current stack");
      }
      prNumber = currentStack.prs[currentStack.prs.length - 1].number;
    } else {
      // If a specific PR number is provided, check if it's in our current stack
      const currentStack = await this.getCurrentStack();
      const isInStack = currentStack.prs.some(pr => pr.number === prNumber);
      if (!isInStack) {
        console.warn(`Warning: PR #${prNumber} is not tracked in current stack, but attempting to publish anyway...`);
      }
    }
    
    await this.github.publishPullRequest(prNumber);
  }

  /**
   * Validate sync status with remote.
   */
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
}
