# Rungs CLI Issue Tracker

This document tracks all work items needed to implement the rungs CLI project.

## Bugs
- [x] Compact mode status command error: `rungs status --compact` throws "undefined is not an object (evaluating 'result.prs.length')" error

- [x] `rungs status` output could be improved. 
  - [x] Show each stack in order, like you currently are
  - [x] For each stack list the individual commits with their descriptions and short version of SHA underneath
  - [x] Separately from the stack, show any local commits that don't below to a stack. 'Unstacked'
  - [x] Overall commit count is not useful (and wrong at the moment) - removed totalCommits field

- `rungs stack` output is verbose. Not sure if this is beacuse verbose mode is the default or not. There is a related feature for this.


- This strange output from rungs status
```

PR #79: Add more bugs and issues → https://github.com/camhahu/rungs/pull/79
  Base: camhahu/implement-compact-mode-line-replacement-for-improv
  a60b6f9 Add more bugs and issues

PR #80: Add issues → https://github.com/camhahu/rungs/pull/80
  Base: camhahu/add-more-bugs-and-issues
  e20b19a Add issues

PR #81: Improve rungs status output with commit details and PR links → https://github.com/camhahu/rungs/pull/81
  Base: camhahu/add-issues
  7687399 Improve rungs status output with commit details and PR links

New Commits (ready to push): 1
  7687399 Improve rungs status output with commit details and PR links
```
- It says there are new commits to push but also that commit is in PR 81 (already stacked)


## Features

- The `rungs stack` command used to be called `rungs push`. There are various places this has not been fixed in the codebase. Fix them all and remove any reference to `rungs push`.

- Test coverage is okay. But we are not enforcing it. Can you add a pre-commit hook to check for code coverage % and ensure it is over 95%. Add new tests to increase the coverage.

- Compact vs verbose mode is confusing. Remove compact as an option. It must be the default. --verbose should stay as a possible option.



---

- Auto sync stacks on every rungs command (or maybe an explicit `rungs sync`)
  - I might have Commit A with Stack/PR A, then Commit B with Stack/PR B.
  - Then, I get PR feedback on Stack A, I switch to the branch for Stack A and make a new commit on Stack A's branch.
  - Then, I want to update Stack A with `rungs amend`. This should push my commit to Stack A's branch. Then it needs to update all of my other stacks to rebase that commit.
  - Or maybe just `rungs amend` will update all the other stacks

---

*Last updated: 2025-07-13*
*Update this file as issues are completed or new ones are identified*
