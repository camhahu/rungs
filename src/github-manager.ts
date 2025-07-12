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
    } catch (error) {
      throw new Error(`Failed to create pull request: ${error}`);
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

  async getPullRequest(branchName: string): Promise<PullRequest | null> {
    try {
      const result = await Bun.$`gh pr view ${branchName} --json number,title,body,url,draft,headRefName,baseRefName`.text();
      const data = JSON.parse(result);
      
      return {
        number: data.number,
        title: data.title,
        body: data.body,
        url: data.url,
        draft: data.draft,
        head: data.headRefName,
        base: data.baseRefName
      };
    } catch {
      // PR doesn't exist
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
