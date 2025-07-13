# Rungs CLI Issue Tracker

This document tracks all work items needed to implement the rungs CLI project.

## Bugs
- [x] Compact mode status command error: `rungs status --compact` throws "undefined is not an object (evaluating 'result.prs.length')" error
- 

## Features
- [x] The CLI output is too long and hard to read. Each discrete 'step' of the CLI command should only really take up 1 line of output, then you know each line should 'replace itself' like some CLIs do.
  - [x] Use of consistent colour for loading states/completed states/error states
  - [x] Better use of bold/italic text formatting to indicate emphasis
  - [x] Added ANSI utilities and progress indicators
  - [x] Full backward compatibility with CLI flags for output control


- Auto sync stacks on every rungs command (or maybe an explicit `rungs sync`)
  - I might have Commit A with Stack/PR A, then Commit B with Stack/PR B.
  - Then, I get PR feedback on Stack A, I switch to the branch for Stack A and make a new commit on Stack A's branch.
  - Then, I want to update Stack A with `rungs amend`. This should push my commit to Stack A's branch. Then it needs to update all of my other stacks to rebase that commit.
  - Or maybe just `rungs amend` will update all the other stacks

---

*Last updated: 2025-07-13*
*Update this file as issues are completed or new ones are identified*
