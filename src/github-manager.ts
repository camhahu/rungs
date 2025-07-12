export interface PullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  draft: boolean;
  head: string;
  base: string;
}

export class GitHubManager {
  async isGitHubCLIAvailable(): Promise<boolean> {
    try {
      await Bun.$`gh --version`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      await Bun.$`gh auth status`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  async getRepoInfo(): Promise<{ owner: string; repo: string }> {
    try {
      const result = await Bun.$`gh repo view --json owner,name`.text();
      const data = JSON.parse(result);
      return {
        owner: data.owner.login,
        repo: data.name
      };
    } catch (error) {
      throw new Error(`Failed to get repository info: ${error}`);
    }
  }

  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string,
    draft: boolean = true
  ): Promise<PullRequest> {
    try {
      // Create a temp file for the body to avoid shell escaping issues
      const bodyFile = `/tmp/rungs-pr-body-${Date.now()}.txt`;
      await Bun.write(bodyFile, body);
      
      try {
        const args = ["gh", "pr", "create", "--title", title, "--body-file", bodyFile, "--head", head, "--base", base];
        if (draft) {
          args.push("--draft");
        }
        
        const prUrl = await Bun.$`${args}`.text();
        
        // Extract PR number from URL
        const prNumber = parseInt(prUrl.trim().split('/').pop() || '0');
        
        return {
          number: prNumber,
          title,
          body,
          url: prUrl.trim(),
          draft,
          head,
          base
        };
      } finally {
        // Clean up temp file
        try {
          await Bun.$`rm ${bodyFile}`.quiet();
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (error: any) {
      // Extract meaningful error information
      let errorMessage = "Failed to create pull request";
      
      if (error.stderr) {
        errorMessage += `: ${error.stderr.toString().trim()}`;
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      } else {
        errorMessage += `: ${error}`;
      }
      
      // Add helpful context for common issues
      if (error.stderr?.includes("remote ref does not exist") || head.length > 63) {
        errorMessage += "\n\nHint: Branch name may be too long. GitHub branch names must be 63 characters or less.";
      }
      
      throw new Error(errorMessage);
    }
  }

  async updatePullRequest(
    prNumber: number,
    title?: string,
    body?: string
  ): Promise<void> {
    try {
      const args: string[] = [];
      if (title) {
        args.push("--title", title);
      }
      if (body) {
        args.push("--body", body);
      }
      
      if (args.length > 0) {
        await Bun.$`gh pr edit ${prNumber} ${args}`;
      }
    } catch (error) {
      throw new Error(`Failed to update pull request #${prNumber}: ${error}`);
    }
  }

  async updatePullRequestBase(prNumber: number, newBase: string): Promise<void> {
    try {
      await Bun.$`gh pr edit ${prNumber} --base ${newBase}`;
    } catch (error) {
      throw new Error(`Failed to update pull request #${prNumber} base to ${newBase}: ${error}`);
    }
  }

  async mergePullRequest(
    prNumber: number, 
    mergeMethod: "squash" | "merge" | "rebase" = "squash",
    deleteBranch: boolean = true
  ): Promise<void> {
    try {
      const args = ["gh", "pr", "merge", prNumber.toString()];
      
      switch (mergeMethod) {
        case "squash":
          args.push("--squash");
          break;
        case "merge":
          args.push("--merge");
          break;
        case "rebase":
          args.push("--rebase");
          break;
      }
      
      if (deleteBranch) {
        args.push("--delete-branch");
      }
      
      await Bun.$`${args}`;
    } catch (error: any) {
      let errorMessage = `Failed to merge PR #${prNumber}`;
      
      if (error.stderr) {
        errorMessage += `: ${error.stderr.toString().trim()}`;
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      throw new Error(errorMessage);
    }
  }

  async getPullRequest(branchName: string): Promise<PullRequest | null> {
    try {
      const result = await Bun.$`gh pr view ${branchName} --json number,title,body,url,isDraft,headRefName,baseRefName`.text();
      const data = JSON.parse(result);
      
      return {
        number: data.number,
        title: data.title,
        body: data.body,
        url: data.url,
        draft: data.isDraft,
        head: data.headRefName,
        base: data.baseRefName
      };
    } catch {
      // PR doesn't exist
      return null;
    }
  }

  async getPullRequestByNumber(prNumber: number): Promise<PullRequest | null> {
    try {
      const result = await Bun.$`gh pr view ${prNumber} --json number,title,body,url,isDraft,headRefName,baseRefName`.text();
      const data = JSON.parse(result);
      
      return {
        number: data.number,
        title: data.title,
        body: data.body,
        url: data.url,
        draft: data.isDraft,
        head: data.headRefName,
        base: data.baseRefName
      };
    } catch {
      // PR doesn't exist
      return null;
    }
  }

  async getPullRequestStatus(prNumber: number): Promise<"open" | "merged" | "closed" | null> {
    try {
      const result = await Bun.$`gh pr view ${prNumber} --json state`.text();
      const data = JSON.parse(result);
      return data.state.toLowerCase();
    } catch {
      // PR doesn't exist or error occurred
      return null;
    }
  }

  async listPullRequests(head?: string): Promise<PullRequest[]> {
    try {
      let cmd = "gh pr list --json number,title,body,url,draft,headRefName,baseRefName";
      if (head) {
        cmd += ` --head ${head}`;
      }
      
      const result = await Bun.$`${cmd}`.text();
      const data = JSON.parse(result);
      
      return data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        body: pr.body,
        url: pr.url,
        draft: pr.draft,
        head: pr.headRefName,
        base: pr.baseRefName
      }));
    } catch (error) {
      throw new Error(`Failed to list pull requests: ${error}`);
    }
  }

  async closePullRequest(prNumber: number): Promise<void> {
    try {
      await Bun.$`gh pr close ${prNumber}`;
    } catch (error) {
      throw new Error(`Failed to close pull request #${prNumber}: ${error}`);
    }
  }

  async publishPullRequest(prNumber: number): Promise<void> {
    try {
      await Bun.$`gh pr ready ${prNumber}`;
    } catch (error: any) {
      let errorMessage = `Failed to publish pull request #${prNumber}`;
      
      if (error.stderr) {
        const stderr = error.stderr.toString().trim();
        errorMessage += `: ${stderr}`;
        
        // Add helpful context for common issues
        if (stderr.includes("not a draft")) {
          errorMessage += "\n\nHint: This PR is already published (not a draft).";
        } else if (stderr.includes("not found")) {
          errorMessage += "\n\nHint: PR number may not exist or you may not have access to it.";
        }
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      throw new Error(errorMessage);
    }
  }

  generatePRTitle(commits: any[]): string {
    if (commits.length === 0) {
      return "Empty stack";
    }
    
    if (commits.length === 1) {
      return commits[0].message;
    }
    
    // For multiple commits, use first commit message with count
    return `${commits[0].message} (+${commits.length - 1} more)`;
  }

  generatePRBody(commits: any[]): string {
    if (commits.length === 0) {
      return "Empty stack - no commits to include.";
    }
    
    if (commits.length === 1) {
      return `Single commit stack:\n\n- ${commits[0].message}`;
    }
    
    const commitList = commits.map(commit => `- ${commit.message}`).join('\n');
    return `Stack of ${commits.length} commits:\n\n${commitList}`;
  }
}
