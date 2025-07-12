# Rungs CLI Issue Tracker

This document tracks all work items needed to implement the rungs CLI project.

BUGS:
- [FIXED] --auto-publish option does not work for the rungs stack command. The PR is still in draft mode after it is created.
- [FIXED] rungs creates its state files in the directory it is run from.
  - rungs should create any state in the user's home directory, under .config/rungs/<state>
  - rungs will need to have state for each local repository it is ran from
  - rungs should bias for using state from the github server, not local state. Unless local state makes rungs noticably faster to the user. 
- When I create 2 stacks on top of each other. They look good. When I merge the first stack, however, then run rungs status, the second stack PR updates to go into main (correct) but it shows the stack as having both Stack 1 and Stack 2's commits - thus the diff is not intuitive.

Commit 1


Commit 2



## Configuration

- [ ] **Configuration Options Implementation**
  - GitHub settings (owner, repo, baseBranch, always auto publish)
  - Branch settings (prefix, naming strategy, maxLength)
  - Stack settings (autoDetect, maxStackSize, grouping)
  - PR settings (defaultDraft, autoLink, template)
  - Sync settings (autoSync, strategy)

---

*Last updated: 2025-12-07*
*Update this file as issues are completed or new ones are identified*
