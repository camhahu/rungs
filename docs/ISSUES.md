# Rungs CLI Issue Tracker

This document tracks all work items needed to implement the rungs CLI project.

## Bugs

- SOmewhere something is setting my computers git config user.name and email. Might be a test. Might have been just you running or testing something in a previous run. I don't want you to ever edit my computer's git config. Any test that does that should be properly isolated. Update them and also update your directives (CLAUDE.md, PROMPT.md) to reflect this

- First time running: if `rungs config set userPrefix` or `rungs config set defaultBranch` haven't been set it behaves weirdly. Can you make rungs return a friendly error? Ideally rungs should silently check config has been set when you run `rungs status` and surface a warning with steps to fix

- If the working changes are ditry it blocks me from making a stack. kind makes sense since it does a pull first. however, if my changes are all untracked files I just want the thing to do it, because obviously an untracked file won't have a conflict, right?

## Features

- Test coverage is okay. But we are not enforcing it. Can you add a pre-commit hook using husky to run the tests and build. Ensure the pre commit hook prints out the test coverage. Do not fix the test coverage yet, but opportunistically, in the future I will get you to improve test coverage. Only do it when asked.

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
