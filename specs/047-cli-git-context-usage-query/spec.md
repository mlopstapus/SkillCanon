# Feature Specification: CLI Git-Context Tagging & Usage Query

**Branch**: `feat/011-004-git-context` | **Created**: 2026-10-30 | **Status**: Draft | **Input**: backlog/011-vcs-integration/004

## User Scenarios & Testing
### US1 - A skill run in a repo records where it ran (P1)
When a developer runs a governed skill from inside a git repo, the usage record carries the repo's remote, branch and commit. Outside a repo (or in the web UI) the run works exactly as before with those fields empty. **Acceptance**: 1. In a repo, all three are sent and stored. 2. Outside a repo or with no remote, nothing is sent and the run still succeeds. 3. Credentials in a remote never leave the machine or get stored.
### US2 - Usage can be matched to a PR's commits (P1)
Given an organization, a repo remote and a list of commit ids, return the successful skill serves recorded for those commits. **Acceptance**: 1. A run recorded over SSH matches a query over HTTPS for the same repo. 2. Never returns another organization's rows. 3. Empty input or an unrecognizable remote returns nothing; failed serves and rows without git context never match.

## Requirements
- FR-001 CLI reads remote/branch/commit via local git, best-effort, and sends them with the expand request.
- FR-002 Remotes are stored in one canonical form (`host/owner/repo`, lower case, no scheme, credentials or `.git`); commit ids lower case.
- FR-003 `queryUsageByRepoAndCommits(orgId, remote, shas)` is exposed by Distribution, org-scoped.
- FR-004 The 90-day floor for rows with a commit id stays documented as a constraint on any future rollup (no pruning exists today).

## Assumptions
GitHub SSH/HTTPS forms are the target (other hosts normalize the same way). Rows recorded before this change may hold raw remotes and will not match; acceptable since no PR evaluation existed yet. The distribution columns already existed.
