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

- [x] Commit mistakenly identified as not belonging to an open stack - Fixed stack misidentification bug where commits appeared as "unstacked" after PR merge and rebase operations due to stale remote refs and timing issues

## Features


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
