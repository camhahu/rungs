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

export class GitManager {
  async getCurrentBranch(): Promise<string> {
    const result = await Bun.$`git rev-parse --abbrev-ref HEAD`.text();
    return result.trim();
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await Bun.$`git rev-parse --git-dir`;
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
      console.log(`Getting commits since: ${baseBranch}`);
      const result = await Bun.$`git log ${baseBranch}..HEAD --pretty=format:%H|%s|%an|%ad --date=iso`.text();
      
      if (!result.trim()) {
        return [];
      }
      
      return result.trim().split('\n').map(line => {
        const [hash, message, author, date] = line.split('|');
        return { hash, message, author, date };
      });
    } catch (error) {
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

  async getCommitMessage(hash: string): Promise<string> {
    try {
      const result = await Bun.$`git log -1 --pretty=format:"%s" ${hash}`.text();
      return result.trim();
    } catch (error) {
      throw new Error(`Failed to get commit message for ${hash}: ${error}`);
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
        
        return `${userPrefix}/${cleanMessage}`;
    }
  }
}
