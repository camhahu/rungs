# Rungs CLI Issue Tracker

This document tracks all work items needed to implement the rungs CLI project.

## Bugs
- [x] Compact mode status command error: `rungs status --compact` throws "undefined is not an object (evaluating 'result.prs.length')" error

- [x] `rungs status` output could be improved. 
  - [x] Show each stack in order, like you currently are
  - [x] For each stack list the individual commits with their descriptions and short version of SHA underneath
  - [x] Separately from the stack, show any local commits that don't below to a stack. 'Unstacked'
  - [x] Overall commit count is not useful (and wrong at the moment) - removed totalCommits field

- [x] `rungs stack` output is verbose. Not sure if this is beacuse verbose mode is the default or not. There is a related feature for this.

- [x] Failing tests - Fixed operation-tracker.ts defensive programming issues causing "TypeError: this.output.failOperation is not a function" errors in auto-publish.test.ts (all 186 tests now pass)


### Rungs merge doesn't respect compact by default
- The `rungs merge` output is still verbose. Make sure it respect compact by default and verbose if explicitly provided. 

### Commit mistakenly identified as not belonging to an open stack
- A commit is mistakenly identified as not belonging to an open stack after stack was rebased after previous stack was merged
  - I had two commits and two open PRs/stacks respectively
  - I merged the first commit with `rungs merge ..`
  - Rungs correctly updated the second stack to rebase properly, and did other things that it does
  - I created a new commit and ran `rungs status`
  - Rungs mistakenly told me that commit 2 (already in a stack) and commit 3 (new, local commit) were both unstacked and would be created in the next stack

Output from above bug:
```
camhahu@Camerons-MacBook-Pro rungs % gst
On branch main
Your branch is ahead of 'origin/main' by 1 commit.
  (use "git push" to publish your local commits)

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   docs/ISSUES.md

no changes added to commit (use "git add" and/or "git commit -a")
camhahu@Camerons-MacBook-Pro rungs % gaa
camhahu@Camerons-MacBook-Pro rungs % git commit -m "Add bug for still verbose outputs in rungs merge"
[main f2829bc] Add bug for still verbose outputs in rungs merge
 1 file changed, 1 insertion(+)
camhahu@Camerons-MacBook-Pro rungs % gst
On branch main
Your branch is ahead of 'origin/main' by 2 commits.
  (use "git push" to publish your local commits)

nothing to commit, working tree clean
camhahu@Camerons-MacBook-Pro rungs % rungs status
✅ Discovering stack from GitHub
✅ Stack status retrieved - 1 PRs, 2 unstacked commits (600ms)
Stack Status: 1 PRs

PR #87: Add feature for PR state in rungs status → https://github.com/camhahu/rungs/pull/87
  Base: main
  40b205c Add feature for PR state in rungs status

New Commits (ready to push): 2
  f2829bc Add bug for still verbose outputs in rungs merge
  aae9cfe Add feature for PR state in rungs status
camhahu@Camerons-MacBook-Pro rungs % gst
On branch main
Your branch is ahead of 'origin/main' by 2 commits.
  (use "git push" to publish your local commits)

nothing to commit, working tree clean
camhahu@Camerons-MacBook-Pro rungs %
```

## Features

- The `rungs stack` command used to be called `rungs push`. There are various places this has not been fixed in the codebase. Fix them all and remove any reference to `rungs push`.

- Test coverage is okay. But we are not enforcing it. Can you add a pre-commit hook to check for code coverage % and ensure it is over 95%. Add new tests to increase the coverage.

- Compact vs verbose mode is confusing. Remove compact as an option. It must be the default. --verbose should stay as a possible option.

- Ensure rungs only modifies PRs that were creates by the user.

- `rungs stack` should work as it currently does by default. Support `rungs stack HEAD~2` and similar git HEAD references to support only stacking 'the last 2 commits'.
  - support `--from=HEAD~3 --to=HEAD~1` to specify a range of commits
  - error and tell the user what they're doing wrong if a commit in the range they've specified is already associated with a stack
  - error and tell the user what they're doing wrong if there are unstacked commits BEFORE the --from commit

- Include the status of the PR in `rungs status`
  - Whether it is in Draft or Review (don't include any other states as they're not relevant to rungs)

---

- Auto sync stacks on every rungs command (or maybe an explicit `rungs sync`)
  - I might have Commit A with Stack/PR A, then Commit B with Stack/PR B.
  - Then, I get PR feedback on Stack A, I switch to the branch for Stack A and make a new commit on Stack A's branch.
  - Then, I want to update Stack A with `rungs amend`. This should push my commit to Stack A's branch. Then it needs to update all of my other stacks to rebase that commit.
  - Or maybe just `rungs amend` will update all the other stacks

---

*Last updated: 2025-07-13*
*Update this file as issues are completed or new ones are identified*
