export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitStatus {
  currentBranch: string;
  isClean: boolean;
  ahead: number;
  behind: number;
}

export type SyncStatus = "clean" | "ahead" | "behind" | "diverged";

export interface SyncCheckResult {
  status: SyncStatus;
  aheadCount: number;
  behindCount: number;
  localCommits: string[];
  remoteCommits: string[];
}

export class GitManager {
  async getCurrentBranch(): Promise<string> {
    const result = await Bun.$`git rev-parse --abbrev-ref HEAD`.text();
    return result.trim();
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await Bun.$`git rev-parse --git-dir`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<GitStatus> {
    const currentBranch = await this.getCurrentBranch();
    
    // Check if working directory is clean
    const statusResult = await Bun.$`git status --porcelain`.text();
    const isClean = statusResult.trim() === "";
    
    // Check ahead/behind status
    let ahead = 0;
    let behind = 0;
    
    try {
      const aheadResult = await Bun.$`git rev-list --count HEAD..origin/${currentBranch}`.text();
      behind = parseInt(aheadResult.trim()) || 0;
      
      const behindResult = await Bun.$`git rev-list --count origin/${currentBranch}..HEAD`.text();
      ahead = parseInt(behindResult.trim()) || 0;
    } catch {
      // Remote tracking branch might not exist
    }
    
    return {
      currentBranch,
      isClean,
      ahead,
      behind
    };
  }

  async getCommitsSince(baseBranch: string): Promise<GitCommit[]> {
    try {
      const result = await Bun.$`git log ${baseBranch}..HEAD '--pretty=format:%H|%s|%an|%ad' --date=iso`.text();
      
      if (!result.trim()) {
        return [];
      }
      
      return result.trim().split('\n').map(line => {
        const [hash, message, author, date] = line.split('|');
        return { hash, message, author, date };
      });
    } catch (error) {
      console.error(`Git command failed for ${baseBranch}:`);
      console.error(error);
      throw new Error(`Failed to get commits since ${baseBranch}: ${error}`);
    }
  }

  async fetchOrigin(): Promise<void> {
    try {
      await Bun.$`git fetch origin`;
    } catch (error) {
      throw new Error(`Failed to fetch from origin: ${error}`);
    }
  }

  async rebaseOnto(targetBranch: string): Promise<void> {
    try {
      await Bun.$`git rebase origin/${targetBranch}`;
    } catch (error) {
      // If rebase fails, we should abort it
      try {
        await Bun.$`git rebase --abort`;
      } catch {
        // Ignore abort errors
      }
      throw new Error(`Failed to rebase onto ${targetBranch}. Please resolve conflicts manually.`);
    }
  }

  async createBranch(branchName: string, fromCommit?: string): Promise<void> {
    try {
      if (fromCommit) {
        await Bun.$`git checkout -b ${branchName} ${fromCommit}`;
      } else {
        await Bun.$`git checkout -b ${branchName}`;
      }
    } catch (error) {
      throw new Error(`Failed to create branch ${branchName}: ${error}`);
    }
  }

  async checkoutBranch(branchName: string): Promise<void> {
    try {
      await Bun.$`git checkout ${branchName}`;
    } catch (error) {
      throw new Error(`Failed to checkout branch ${branchName}: ${error}`);
    }
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      await Bun.$`git rev-parse --verify ${branchName}`;
      return true;
    } catch {
      return false;
    }
  }

  async pushBranch(branchName: string, force: boolean = false): Promise<void> {
    try {
      const forceFlag = force ? "--force-with-lease" : "";
      if (force) {
        await Bun.$`git push origin ${branchName} --force-with-lease`;
      } else {
        await Bun.$`git push origin ${branchName}`;
      }
    } catch (error) {
      throw new Error(`Failed to push branch ${branchName}: ${error}`);
    }
  }

  async getRemoteUrl(): Promise<string> {
    try {
      const result = await Bun.$`git remote get-url origin`.text();
      return result.trim();
    } catch (error) {
      throw new Error(`Failed to get remote URL: ${error}`);
    }
  }

  async getCommitHash(ref: string): Promise<string> {
    try {
      const result = await Bun.$`git rev-parse ${ref}`.text();
      return result.trim();
    } catch (error) {
      throw new Error(`Failed to get commit hash for ${ref}: ${error}`);
    }
  }

  async getCommitMessage(hash: string): Promise<string> {
    try {
      const result = await Bun.$`git log -1 --pretty=format:"%s" ${hash}`.text();
      return result.trim();
    } catch (error) {
      throw new Error(`Failed to get commit message for ${hash}: ${error}`);
    }
  }

  async getSyncStatus(remoteBranch: string): Promise<SyncCheckResult> {
    try {
      // Ensure we have latest remote info
      await this.fetchOrigin();
      
      const remoteRef = `origin/${remoteBranch}`;
      
      // Check if remote branch exists
      try {
        await Bun.$`git rev-parse --verify ${remoteRef}`.quiet();
      } catch {
        // Remote branch doesn't exist, consider it clean
        return {
          status: "clean",
          aheadCount: 0,
          behindCount: 0,
          localCommits: [],
          remoteCommits: []
        };
      }
      
      // Get commits that are ahead (local has but remote doesn't)
      const aheadResult = await Bun.$`git rev-list --count ${remoteRef}..HEAD`.text();
      const aheadCount = parseInt(aheadResult.trim()) || 0;
      
      // Get commits that are behind (remote has but local doesn't)  
      const behindResult = await Bun.$`git rev-list --count HEAD..${remoteRef}`.text();
      const behindCount = parseInt(behindResult.trim()) || 0;
      
      // Get actual commit hashes for detailed analysis
      let localCommits: string[] = [];
      let remoteCommits: string[] = [];
      
      if (aheadCount > 0) {
        const localResult = await Bun.$`git rev-list ${remoteRef}..HEAD`.text();
        localCommits = localResult.trim().split('\n').filter(Boolean);
      }
      
      if (behindCount > 0) {
        const remoteResult = await Bun.$`git rev-list HEAD..${remoteRef}`.text();
        remoteCommits = remoteResult.trim().split('\n').filter(Boolean);
      }
      
      // Determine sync status
      let status: SyncStatus;
      if (aheadCount === 0 && behindCount === 0) {
        status = "clean";
      } else if (aheadCount > 0 && behindCount === 0) {
        status = "ahead";
      } else if (aheadCount === 0 && behindCount > 0) {
        status = "behind";
      } else {
        status = "diverged";
      }
      
      return {
        status,
        aheadCount,
        behindCount,
        localCommits,
        remoteCommits
      };
    } catch (error) {
      throw new Error(`Failed to check sync status with ${remoteBranch}: ${error}`);
    }
  }

  async detectDuplicateCommits(remoteBranch: string): Promise<{ hasDuplicates: boolean; duplicateMessages: string[] }> {
    try {
      const remoteRef = `origin/${remoteBranch}`;
      
      // Get local commits ahead of remote
      const localResult = await Bun.$`git log ${remoteRef}..HEAD --pretty=format:"%s"`.text();
      const localMessages = localResult.trim().split('\n').filter(Boolean);
      
      if (localMessages.length === 0) {
        return { hasDuplicates: false, duplicateMessages: [] };
      }
      
      // Get recent remote commits  
      const remoteResult = await Bun.$`git log ${remoteRef} --pretty=format:"%s" -20`.text();
      const recentRemoteMessages = remoteResult.trim().split('\n').filter(Boolean);
      
      // Check for duplicate commit messages
      const duplicates = localMessages.filter(msg => 
        recentRemoteMessages.some(remoteMsg => remoteMsg.trim() === msg.trim())
      );
      
      return {
        hasDuplicates: duplicates.length > 0,
        duplicateMessages: duplicates
      };
    } catch (error) {
      throw new Error(`Failed to detect duplicate commits: ${error}`);
    }
  }

  generateBranchName(commits: GitCommit[], userPrefix: string, strategy: "commit-message" | "sequential" | "timestamp"): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    
    switch (strategy) {
      case "timestamp":
        return `${userPrefix}/${timestamp}`;
        
      case "sequential":
        return `${userPrefix}/stack-${Date.now()}`;
        
      case "commit-message":
      default:
        if (commits.length === 0) {
          return `${userPrefix}/empty-${timestamp}`;
        }
        
        // Use the first commit message, clean it up for branch name
        const firstCommit = commits[0];
        const cleanMessage = firstCommit.message
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 50);
        
        const fullBranchName = `${userPrefix}/${cleanMessage}`;
        
        // GitHub branch names must be 63 characters or less
        if (fullBranchName.length > 63) {
          const availableLength = 63 - userPrefix.length - 1; // -1 for the slash
          const truncatedMessage = cleanMessage.slice(0, availableLength);
          return `${userPrefix}/${truncatedMessage}`;
        }
        
        return fullBranchName;
    }
  }

  async pullLatestChanges(branch: string): Promise<void> {
    try {
      // Fetch latest changes from remote
      await Bun.$`git fetch origin`;
      
      // Check if we're on the target branch
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch !== branch) {
        await this.checkoutBranch(branch);
      }
      
      // Rebase local changes on top of remote (cleaner than merge)
      await Bun.$`git rebase origin/${branch}`;
    } catch (error) {
      // If rebase fails, try to abort it
      try {
        await Bun.$`git rebase --abort`;
      } catch {
        // Ignore abort errors
      }
      throw new Error(`Failed to pull latest changes for ${branch}: ${error}`);
    }
  }

  async fetchBranch(branch: string): Promise<void> {
    try {
      await Bun.$`git fetch origin ${branch}`;
    } catch (error) {
      throw new Error(`Failed to fetch branch ${branch}: ${error}`);
    }
  }

  async pushForceWithLease(branch: string): Promise<void> {
    try {
      await Bun.$`git push origin ${branch} --force-with-lease`;
    } catch (error) {
      throw new Error(`Failed to force push branch ${branch}: ${error}`);
    }
  }

  async rebaseOntoTarget(newBase: string, oldBase: string): Promise<void> {
    try {
      await Bun.$`git rebase --onto ${newBase} ${oldBase}`;
    } catch (error) {
      // If rebase fails, we should abort it
      try {
        await Bun.$`git rebase --abort`;
      } catch {
        // Ignore abort errors
      }
      throw new Error(`Failed to rebase onto ${newBase} from ${oldBase}. Please resolve conflicts manually.`);
    }
  }

  /**
   * Get all commits for a specific branch that aren't in the base branch
   */
  async getCommitsForBranch(branchName: string, baseBranch: string = "main"): Promise<GitCommit[]> {
    try {
      const result = await Bun.$`git log origin/${baseBranch}..origin/${branchName} '--pretty=format:%H|%s|%an|%ad' --date=iso`.text();
      
      if (!result.trim()) {
        return [];
      }
      
      return result.trim().split('\n').map(line => {
        const [hash, message, author, date] = line.split('|');
        return { hash, message, author, date };
      });
    } catch (error) {
      // If the branch doesn't exist remotely, try locally
      try {
        const localResult = await Bun.$`git log ${baseBranch}..${branchName} '--pretty=format:%H|%s|%an|%ad' --date=iso`.text();
        
        if (!localResult.trim()) {
          return [];
        }
        
        return localResult.trim().split('\n').map(line => {
          const [hash, message, author, date] = line.split('|');
          return { hash, message, author, date };
        });
      } catch (localError) {
        console.error(`Git command failed for branch ${branchName}:`);
        console.error(localError);
        return [];
      }
    }
  }

  /**
   * Find commits on current branch that aren't in any stack branch or default branch
   */
  async getUnstakedCommits(stackBranches: string[], defaultBranch: string, debug = false): Promise<GitCommit[]> {
    try {
      // Build exclusion list: origin/defaultBranch + all existing stack branches
      const exclusions = [`origin/${defaultBranch}`];
      
      // Add existing stack branches to exclusions
      for (const branch of stackBranches) {
        exclusions.push(`origin/${branch}`);
      }

      if (debug) {
        console.log('[DEBUG] getUnstakedCommits - Stack branches for exclusion:', stackBranches);
        console.log('[DEBUG] getUnstakedCommits - Exclusions being tried:', exclusions);
      }

      let newCommits: GitCommit[] = [];
      let foundWorkingExclusion = false;
      const validatedExclusions: Array<{exclusion: string, commitCount: number}> = [];

      // Try different strategies to find new commits
      for (const exclusion of exclusions) {
        try {
          // Check if this ref exists
          await Bun.$`git rev-parse --verify ${exclusion}`.quiet();

          // Get commits since this ref
          const commitsFromThisRef = await this.getCommitsSince(exclusion);
          validatedExclusions.push({ exclusion, commitCount: commitsFromThisRef.length });

          if (debug) {
            console.log(`[DEBUG] getUnstakedCommits - Exclusion ${exclusion}: found ${commitsFromThisRef.length} commits`);
          }

          // Use the ref that gives us the smallest set of new commits
          // (most recent starting point)
          // CRITICAL FIX: Accept 0 commits as a valid result (when HEAD equals stack branch tip)
          if (newCommits.length === 0 || commitsFromThisRef.length < newCommits.length) {
            newCommits = commitsFromThisRef;
            if (debug) {
              console.log(`[DEBUG] getUnstakedCommits - Using ${exclusion} as best exclusion (${commitsFromThisRef.length} commits)`);
            }
          }
          
          foundWorkingExclusion = true;
        } catch {
          // This ref doesn't exist, skip it
          if (debug) {
            console.log(`[DEBUG] getUnstakedCommits - Branch ${exclusion} does not exist, skipping exclusion`);
          }
          continue;
        }
      }

      if (debug) {
        console.log('[DEBUG] getUnstakedCommits - Final result:', {
          foundWorkingExclusion,
          finalCommitCount: newCommits.length,
          validatedExclusions
        });
      }

      // If no exclusions worked, fall back to just origin/defaultBranch
      if (!foundWorkingExclusion) {
        try {
          newCommits = await this.getCommitsSince(`origin/${defaultBranch}`);
          if (debug) {
            console.log(`[DEBUG] getUnstakedCommits - Fallback to origin/${defaultBranch}: ${newCommits.length} commits`);
          }
        } catch {
          // Last resort: get commits from a reasonable base
          try {
            const rootCommit = await Bun.$`git rev-list --max-parents=0 HEAD`.text();
            const baseRef = rootCommit.trim().split('\n')[0];
            newCommits = await this.getCommitsSince(baseRef);
            if (debug) {
              console.log(`[DEBUG] getUnstakedCommits - Last resort fallback to root commit: ${newCommits.length} commits`);
            }
          } catch {
            newCommits = [];
            if (debug) {
              console.log('[DEBUG] getUnstakedCommits - All fallbacks failed, returning empty array');
            }
          }
        }
      }

      return newCommits;
    } catch (error) {
      console.error(`Failed to get unstacked commits: ${error}`);
      return [];
    }
  }
}
