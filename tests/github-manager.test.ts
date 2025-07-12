import { test, expect, beforeEach } from "bun:test";
import { GitHubManager } from "../src/github-manager";

let githubManager: GitHubManager;

beforeEach(() => {
  githubManager = new GitHubManager();
});

test("should generate PR title for single commit", () => {
  const commits = [
    { hash: "abc123", message: "Add user authentication", author: "test", date: "2023-01-01" }
  ];
  
  const title = githubManager.generatePRTitle(commits);
  expect(title).toBe("Add user authentication");
});

test("should generate PR title for multiple commits", () => {
  const commits = [
    { hash: "abc123", message: "Add user authentication", author: "test", date: "2023-01-01" },
    { hash: "def456", message: "Fix login bug", author: "test", date: "2023-01-02" },
    { hash: "ghi789", message: "Update documentation", author: "test", date: "2023-01-03" }
  ];
  
  const title = githubManager.generatePRTitle(commits);
  expect(title).toBe("Add user authentication (+2 more)");
});

test("should generate PR title for empty commits", () => {
  const commits: any[] = [];
  
  const title = githubManager.generatePRTitle(commits);
  expect(title).toBe("Empty stack");
});

test("should generate PR body for single commit", () => {
  const commits = [
    { hash: "abc123", message: "Add user authentication", author: "test", date: "2023-01-01" }
  ];
  
  const body = githubManager.generatePRBody(commits);
  expect(body).toBe("Single commit stack:\n\n- Add user authentication");
});

test("should generate PR body for multiple commits", () => {
  const commits = [
    { hash: "abc123", message: "Add user authentication", author: "test", date: "2023-01-01" },
    { hash: "def456", message: "Fix login bug", author: "test", date: "2023-01-02" }
  ];
  
  const body = githubManager.generatePRBody(commits);
  expect(body).toBe("Stack of 2 commits:\n\n- Add user authentication\n- Fix login bug");
});

test("should generate PR body for empty commits", () => {
  const commits: any[] = [];
  
  const body = githubManager.generatePRBody(commits);
  expect(body).toBe("Empty stack - no commits to include.");
});

// Note: Integration tests with actual GitHub CLI would require 
// authentication and a real repository, so we focus on unit tests
// for the business logic here.
