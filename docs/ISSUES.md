# Rungs CLI Issue Tracker

This document tracks all work items needed to implement the rungs CLI project.

BUGS:
- --auto-publish option does not work for the rungs stack command. The PR is still in draft mode after it is created.
- rungs creates its state files in the directory it is run from.
  - rungs should create any state in the user's home directory, under .config/rungs/<state>
  - rungs will need to have state for each local repository it is ran from
  - rungs should bias for using state from the github server, not local state. Unless local state makes rungs noticably faster to the user. 

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
