import { ConfigManager } from "./config-manager.js";
import { GitManager, GitCommit } from "./git-manager.js";
import { GitHubManager, PullRequest } from "./github-manager.js";
import { output, startGroup, endGroup, logProgress, logSuccess, logWarning, logInfo, logSummary } from "./output-manager.js";
import { OperationTracker } from "./operation-tracker.js";

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
  unstakedCommits: GitCommit[];
  lastBranch?: string;
}

/**
 * GitHub-first StackManager that uses GitHub as the single source of truth.
 * Eliminates local state files and discovers stack information from GitHub.
 */
export class StackManager {
  private tracker: OperationTracker;

  constructor(
    private config: ConfigManager,
    private git: GitManager,
    private github: GitHubManager,
    private outputMode: 'compact' | 'verbose' = 'compact'
  ) {
    this.tracker = new OperationTracker(output);
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
  }

  /**
   * Discover current stack state from GitHub by finding open PRs
   * and building the topological order from base->head chains.
   */
  async getCurrentStack(): Promise<StackState> {
    if (this.outputMode === 'compact') {
      return await this.tracker.githubOperation(
        "Discovering stack from GitHub",
        async () => {
          const config = await this.config.getAll();

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

          if (stackPRs.length === 0) {
            return { prs: [], unstakedCommits: [] };
          }

          // Build topological order by following base->head chains
          const orderedPRs = this.buildStackOrder(stackPRs, config.defaultBranch);

          // Auto-fix any broken base chains
          const fixedPRs = await this.autoFixBrokenChains(orderedPRs, config.defaultBranch);

          // Populate commits for each PR
          const prsWithCommits = await this.populateStackCommits(
            fixedPRs.map(pr => ({
              number: pr.number,
              branch: pr.headRefName,
              title: pr.title,
              url: pr.url,
              base: pr.baseRefName,
              head: pr.headRefName
            })),
            config.defaultBranch
          );

          // Get unstacked commits
          const stackBranches = fixedPRs.map(pr => pr.headRefName);
          const unstakedCommits = await this.git.getUnstakedCommits(stackBranches, config.defaultBranch);

          // CRITICAL FIX: Deduplicate commits by SHA to prevent double-counting
          const prCommitHashes = new Set(prsWithCommits.flatMap(pr => 
            pr.commits?.map(c => c.hash) || []
          ));
          const deduplicatedUnstacked = unstakedCommits.filter(commit => 
            !prCommitHashes.has(commit.hash)
          );

          const stackState: StackState = {
            prs: prsWithCommits,
            unstakedCommits: deduplicatedUnstacked,
            lastBranch: fixedPRs.length > 0 ? fixedPRs[fixedPRs.length - 1].headRefName : undefined
          };

          return stackState;
        }
      );
    } else {
      // Verbose mode - use traditional logging
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
          return { prs: [], unstakedCommits: [] };
        }

        logProgress("Building stack order from base chains...");

        // Build topological order by following base->head chains
        const orderedPRs = this.buildStackOrder(stackPRs, config.defaultBranch);

        logProgress("Validating and auto-fixing broken chains...");

        // Auto-fix any broken base chains
        const fixedPRs = await this.autoFixBrokenChains(orderedPRs, config.defaultBranch);

        // Populate commits for each PR
        const prsWithCommits = await this.populateStackCommits(
          fixedPRs.map(pr => ({
            number: pr.number,
            branch: pr.headRefName,
            title: pr.title,
            url: pr.url,
            base: pr.baseRefName,
            head: pr.headRefName
          })),
          config.defaultBranch
        );

        // Get unstacked commits
        const stackBranches = fixedPRs.map(pr => pr.headRefName);
        const unstakedCommits = await this.git.getUnstakedCommits(stackBranches, config.defaultBranch);

        // CRITICAL FIX: Deduplicate commits by SHA to prevent double-counting
        const prCommitHashes = new Set(prsWithCommits.flatMap(pr => 
          pr.commits?.map(c => c.hash) || []
        ));
        const deduplicatedUnstacked = unstakedCommits.filter(commit => 
          !prCommitHashes.has(commit.hash)
        );

        const stackState: StackState = {
          prs: prsWithCommits,
          unstakedCommits: deduplicatedUnstacked,
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
  }

  /**
   * Get new commits that aren't in origin/main or existing stack branches.
   * Uses git ranges to find commits ready to be pushed.
   */
  async getNewCommits(): Promise<GitCommit[]> {
    if (this.outputMode === 'compact') {
      return await this.tracker.gitOperation(
        "Finding new commits",
        async () => {
          return await this.findNewCommitsInternal();
        },
        {
          successMessage: (commits) => `Found ${commits.length} new commits`
        }
      );
    } else {
      startGroup("Finding New Commits", "git");
      const commits = await this.findNewCommitsInternal();
      endGroup();
      return commits;
    }
  }

  /**
   * Internal method to find new commits (used by both compact and verbose modes)
   */
  private async findNewCommitsInternal(): Promise<GitCommit[]> {
    const config = await this.config.getAll();
    const currentStack = await this.getCurrentStack();

    if (this.outputMode === 'verbose') {
      logProgress("Determining base reference...");
    }

    // Build exclusion list: origin/main + all existing stack branches
    const exclusions = [`origin/${config.defaultBranch}`];

    // Add existing stack branches to exclusions
    for (const pr of currentStack.prs) {
      exclusions.push(`origin/${pr.branch}`);
    }

    if (this.outputMode === 'verbose') {
      logInfo(`Excluding commits from: ${exclusions.join(", ")}`, 1);
      logProgress("Scanning for new commits...");
    }

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
            if (this.outputMode === 'verbose') {
              logInfo(`Using ${exclusion} as base (${commitsFromThisRef.length} new commits)`, 1);
            }
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
        if (this.outputMode === 'verbose') {
          logInfo(`Falling back to origin/${config.defaultBranch}`, 1);
        }
      } catch {
        // Last resort: get commits from a reasonable base
        try {
          const rootCommit = await Bun.$`git rev-list --max-parents=0 HEAD`.text();
          const baseRef = rootCommit.trim().split('\n')[0];
          newCommits = await this.git.getCommitsSince(baseRef);
          if (this.outputMode === 'verbose') {
            logInfo(`Using root commit as base`, 1);
          }
        } catch {
          newCommits = [];
        }
      }
    }

    if (this.outputMode === 'verbose') {
      logSuccess(`Found ${newCommits.length} new commits`);

      if (newCommits.length > 0) {
        const commitList = newCommits.map(c => `${c.hash.slice(0, 7)}: ${c.message}`);
        output.logList(commitList, "New commits:", "info");
      }
    }

    return newCommits;
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
      if (this.outputMode === 'compact') {
        await this.tracker.gitOperation(
          "Fetching latest changes",
          async () => {
            await this.git.fetchOrigin();
            if (status.behind > 0) {
              await this.git.rebaseOnto(config.defaultBranch);
            }
          },
          {
            successMessage: () => status.behind > 0 ? 
              `Fetched and rebased ${status.behind} commits` : 
              "Fetched latest changes"
          }
        );
      } else {
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
    }

    // Get new commits using the GitHub-first approach
    const newCommits = await this.getNewCommits();

    if (newCommits.length === 0) {
      if (this.outputMode === 'verbose') {
        logInfo("No new commits to process.");
      }
      return;
    }

    if (this.outputMode === 'verbose') {
      startGroup("Processing Commits", "git");
      logInfo(`Found ${newCommits.length} new commits to process.`);

      // List the commits being processed
      const commitList = newCommits.map(c => `${c.hash.slice(0, 7)}: ${c.message}`);
      output.logList(commitList, "Commits to process:", "info");
      endGroup();
    }

    // Check for duplicate PRs with these commits
    const commitShas = newCommits.map(c => c.hash);
    const existingPRs = await this.github.findPRsWithCommits(commitShas);

    if (this.outputMode === 'compact') {
      if (existingPRs.length > 0) {
        const existingPR = existingPRs[0]; // Use the first matching PR
        throw new Error(`These commits already exist in PR #${existingPR.number}: ${existingPR.title} (${existingPR.url})`);
      }
    } else {
      startGroup("Checking for Duplicate PRs", "github");
      logProgress("Searching for existing PRs with these commits...");

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
    }

    // Create branch for the new commits
    const branchName = this.git.generateBranchName(newCommits, config.userPrefix, config.branchNaming);

    // Check if branch already exists
    if (await this.git.branchExists(branchName)) {
      throw new Error(`Branch ${branchName} already exists. Please delete it or use a different naming strategy.`);
    }

    if (this.outputMode === 'compact') {
      // Create branch 
      await this.tracker.gitOperation(
        `Creating and pushing branch ${branchName}`,
        async () => {
          await this.git.createBranch(branchName);
          await this.git.pushBranch(branchName);
        }
      );

      // Create PR
      const prTitle = this.github.generatePRTitle(newCommits);
      const prBody = this.github.generatePRBody(newCommits);
      const currentStack = await this.getCurrentStack();
      const baseBranch = currentStack.lastBranch || config.defaultBranch;
      const isDraft = autoPublish ? false : config.draftPRs;

      const pr = await this.tracker.githubOperation(
        `Creating PR: ${prTitle}`,
        async () => {
          return await this.github.createPullRequest(
            prTitle,
            prBody,
            branchName,
            baseBranch,
            isDraft
          );
        }
      );

      // Finalize
      await this.tracker.gitOperation(
        "Returning to main branch",
        async () => {
          await this.git.checkoutBranch(config.defaultBranch);
        }
      );

    } else {
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

      logInfo(`You can now continue working on ${config.defaultBranch} and run 'rungs stack' again for additional commits.`);
    }
  }

  /**
   * Populate the commits field for each PR by fetching commit details
   */
  private async populateStackCommits(stackPRs: StackPR[], defaultBranch: string): Promise<StackPR[]> {
    // Fetch latest remote refs to ensure accurate commit detection after rebases
    // Only attempt if we have a real remote origin (not in test environments)
    try {
      const remoteUrl = await this.git.getRemoteUrl();
      if (remoteUrl && !remoteUrl.includes('test/repo.git')) {
        await this.git.fetchOrigin();
      }
    } catch (error) {
      // Silently continue without fetch in test environments or when no remote exists
      if (this.outputMode === 'verbose') {
        console.warn(`Warning: Could not fetch remote refs: ${error}`);
      }
    }
    
    const populatedPRs: StackPR[] = [];
    
    for (const pr of stackPRs) {
      try {
        const commits = await this.git.getCommitsForBranch(pr.branch, pr.base);
        populatedPRs.push({
          ...pr,
          commits: commits
        });
        
        if (this.outputMode === 'verbose') {
          console.log(`  Found ${commits.length} commits for PR #${pr.number} (${pr.branch})`);
        }
      } catch (error) {
        // If we can't get commits for this PR, include it without commits
        console.warn(`Warning: Could not get commits for PR #${pr.number} (${pr.branch}): ${error}`);
        populatedPRs.push({
          ...pr,
          commits: []
        });
      }
    }
    
    return populatedPRs;
  }

  /**
   * Get current status using GitHub as source of truth.
   */
  async getStatus(): Promise<string> {
    await this.ensurePrerequisites();

    const config = await this.config.getAll();
    const gitStatus = await this.git.getStatus();
    const currentStack = await this.getCurrentStack();

    let statusMessage = `
Current Status:
- Branch: ${gitStatus.currentBranch}
- Clean: ${gitStatus.isClean ? "Yes" : "No"}
- Ahead: ${gitStatus.ahead} commits
- Behind: ${gitStatus.behind} commits

Stack Status (from GitHub):
- Active PRs: ${currentStack.prs.length}
`;

    if (currentStack.prs.length > 0) {
      statusMessage += `\nActive PRs (in stack order):`;
      currentStack.prs.forEach((pr, i) => {
        statusMessage += `\n  ${i + 1}. PR #${pr.number}: ${pr.head} <- ${pr.base}`;
        statusMessage += `\n     → ${pr.url}`;
        
        if (pr.commits && pr.commits.length > 0) {
          statusMessage += `\n     Commits:`;
          pr.commits.forEach(commit => {
            statusMessage += `\n       - ${commit.hash.slice(0, 7)}: ${commit.message}`;
          });
        } else {
          statusMessage += `\n     Commits: (none)`;
        }
      });
    }

    if (currentStack.unstakedCommits && currentStack.unstakedCommits.length > 0) {
      statusMessage += `\n\nNew Commits (ready to push) - ${currentStack.unstakedCommits.length}:`;
      currentStack.unstakedCommits.forEach(commit => {
        statusMessage += `\n  - ${commit.hash.slice(0, 7)}: ${commit.message}`;
      });
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

    // Get current stack state first
    const currentStack = await this.getCurrentStack();

    // If no PR number provided, find the top PR in the stack
    if (!prNumber) {
      if (currentStack.prs.length === 0) {
        throw new Error("No PRs found in current stack");
      }
      prNumber = currentStack.prs[currentStack.prs.length - 1].number;
    }

    // CRITICAL FIX: Pre-emptively update dependent PR bases BEFORE merging
    // This prevents GitHub from auto-closing dependent PRs when the branch is deleted
    const prBeingMerged = currentStack.prs.find(pr => pr.number === prNumber);

    if (prBeingMerged && deleteBranch) {
      // Find PRs that will be affected by this merge (those pointing to the branch being deleted)
      const dependentPRs = currentStack.prs.filter(pr =>
        pr.base === prBeingMerged.head && pr.number !== prNumber
      );

      if (dependentPRs.length > 0) {
        startGroup(`Pre-merge stack updates`, "github");
        logInfo(`Found ${dependentPRs.length} dependent PRs that need base updates before merge`);

        for (const dependentPR of dependentPRs) {
          // Find the correct new base for this PR AFTER the merge
          const prBeingMergedIndex = currentStack.prs.findIndex(pr => pr.number === prNumber);
          const config = await this.config.getAll();
          const newBase = prBeingMergedIndex > 0 ? currentStack.prs[prBeingMergedIndex - 1].head : config.defaultBranch;

          try {
            logProgress(`Updating PR #${dependentPR.number}: ${dependentPR.base} -> ${newBase}`, 1);
            await this.github.updatePullRequestBase(dependentPR.number, newBase);
            logSuccess(`Pre-updated PR #${dependentPR.number} base to avoid auto-closure`, 1);
          } catch (error) {
            logWarning(`Could not pre-update PR #${dependentPR.number} base: ${error}`, 1);
          }
        }

        endGroup();
      }
    }

    // CRITICAL: Capture commit hash BEFORE merge for squash merge restacking
    let oldBaseCommit: string | undefined;
    if (prBeingMerged && deleteBranch && mergeMethod === "squash") {
      const dependentPRs = currentStack.prs.filter(pr =>
        pr.base === prBeingMerged.head && pr.number !== prNumber
      );

      if (dependentPRs.length > 0) {
        // Capture the commit hash of the parent branch BEFORE it gets deleted
        oldBaseCommit = await this.git.getCommitHash(`origin/${prBeingMerged.head}`);
      }
    }

    logInfo(`Merging PR #${prNumber} using ${mergeMethod} merge...`);

    // Merge the PR
    await this.github.mergePullRequest(prNumber, mergeMethod, deleteBranch);

    logSuccess(`✅ Successfully merged PR #${prNumber}`);

    // CRITICAL: After squash merge, restack dependent branches to remove duplicate commits
    if (prBeingMerged && deleteBranch && mergeMethod === "squash" && oldBaseCommit) {
      const dependentPRs = currentStack.prs.filter(pr =>
        pr.base === prBeingMerged.head && pr.number !== prNumber
      );

      if (dependentPRs.length > 0) {
        const config = await this.config.getAll();
        const prBeingMergedIndex = currentStack.prs.findIndex(pr => pr.number === prNumber);
        const newBase = prBeingMergedIndex > 0 ? currentStack.prs[prBeingMergedIndex - 1].head : config.defaultBranch;
        
        await this.restackDependents(dependentPRs, oldBaseCommit, newBase);
      }
    }

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
   * Restack dependent branches after a squash merge to remove duplicate commits.
   * This method rebases dependent PRs to remove commits that were squashed.
   */
  private async restackDependents(
    dependentPRs: StackPR[],
    oldBaseCommit: string,
    newBase: string
  ): Promise<void> {
    if (dependentPRs.length === 0) {
      return;
    }

    startGroup(`Restacking ${dependentPRs.length} dependent branches`, "git");
    logInfo(`Rebasing dependent PRs to remove squashed commits`);

    const originalBranch = await this.git.getCurrentBranch();

    try {
      for (const pr of dependentPRs) {
        logProgress(`Restacking PR #${pr.number} (${pr.head})`, 1);
        
        try {
          // Checkout the dependent branch
          await this.git.checkoutBranch(pr.head);
          
          // Fetch latest state of new base (oldBaseCommit is already a commit hash, no need to fetch)
          await this.git.fetchBranch(newBase);
          
          // Rebase --onto to remove duplicate commits
          await this.git.rebaseOntoTarget(`origin/${newBase}`, oldBaseCommit);
          
          // Force push the rebased branch
          await this.git.pushForceWithLease(pr.head);
          
          logSuccess(`Restacked PR #${pr.number}`, 1);
        } catch (error) {
          logWarning(`Failed to restack PR #${pr.number}: ${error}`, 1);
          
          // Try to abort any ongoing rebase
          try {
            await Bun.$`git rebase --abort`.quiet();
          } catch {
            // Ignore abort errors
          }
        }
      }
    } finally {
      // Return to original branch
      try {
        await this.git.checkoutBranch(originalBranch);
      } catch (error) {
        logWarning(`Could not return to original branch ${originalBranch}: ${error}`);
      }
    }

    endGroup();
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
    if (this.outputMode === 'compact') {
      await this.tracker.gitOperation(
        "Validating sync status",
        async () => {
          await this.validateSyncStatusInternal(defaultBranch);
        }
      );
    } else {
      startGroup("Validating Sync Status", "git");
      await this.validateSyncStatusInternal(defaultBranch);
      endGroup();
    }
  }

  /**
   * Internal sync status validation
   */
  private async validateSyncStatusInternal(defaultBranch: string): Promise<void> {
    if (this.outputMode === 'verbose') {
      logProgress("Checking sync status with remote...");
    }
    
    const syncResult = await this.git.getSyncStatus(defaultBranch);

    if (syncResult.status === "clean") {
      if (this.outputMode === 'verbose') {
        logSuccess("Local branch is in sync with remote");
      }
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
          if (this.outputMode === 'verbose') {
            logInfo(`Local is ${syncResult.aheadCount} commits ahead with new changes - ready to create PR`);
          }
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

    throw new Error(errorMessage);
  }
}
