---
epic: 011-vcs-integration
feature: 004-cli-git-context-tagging-and-usage-query-api
status: open
dependencies: []
---

# CLI Git-Context Tagging & Usage Query API

Extend the `skillcanon` CLI to tag each skill invocation with local git context, and add the read-side query Distribution exposes so `vcs-integration` can correlate usage against a PR's commits — the exact, non-probabilistic correlation mechanism decided in [PDR-013](../../docs/pdr/013-cli-side-git-context-tagging.md).

## Requirements

- [ ] `distribution.prompt_usage` gains three nullable columns: `git_remote_url`, `git_branch`, `git_commit_sha`.
- [ ] The `skillcanon` CLI, when invoking the expand endpoint, reads the local repo's remote URL, current branch, and current commit sha (via local git plumbing, e.g. shelling to `git` or a git library) and sends them as additional fields on the existing invocation request.
- [ ] Outside a git repo (or on any error reading git state), the CLI sends null/omits these fields rather than failing the invocation — git-context tagging is best-effort, never a hard requirement for a skill to run.
- [ ] `queryUsageByRepoAndCommits(orgId, gitRemoteUrl, commitShas[])` is implemented on Distribution: returns matching `prompt_usage` rows (joined against org for tenant isolation) whose `git_remote_url` matches and `git_commit_sha` is in the given list.
- [ ] `git_remote_url` is normalized before storage/comparison (e.g. strip `.git` suffix, normalize `git@`/`https://` forms to one canonical shape) so a repo cloned over SSH vs HTTPS still correlates.
- [ ] The 90-day retention floor for rows with non-null `git_commit_sha` (PDR-015) is implemented wherever `prompt_usage` rollup/pruning already exists or is later added — if no pruning job exists yet, document the floor as a constraint on any future one rather than building a job that doesn't need to exist yet.

## Acceptance Criteria

- [ ] Running a skill via the CLI inside a real git repo produces a `prompt_usage` row with all three git-context fields populated correctly.
- [ ] Running a skill via the CLI outside a git repo (or via the web UI) produces a row with null git-context fields, and the invocation itself still succeeds.
- [ ] `queryUsageByRepoAndCommits` correctly matches rows regardless of whether the remote URL was recorded via SSH or HTTPS form, given the same underlying repo.
- [ ] `queryUsageByRepoAndCommits` never returns another organization's usage rows, even given a matching remote URL (tenant isolation).

## Open Questions

- Exact remote-URL normalization rule (which git host formats need covering — GitHub SSH/HTTPS at minimum, given this epic's scope; GitLab/Bitbucket forms can wait for whenever a second VCS adapter is built).

## Dependencies

- `backlog/008-distribution/005-skill-sync-cli.md` must be done (this feature extends the existing CLI, not build it from scratch)
- `backlog/008-distribution/004-usage-telemetry.md` must be done (`prompt_usage` table must already exist to add columns to)

## Technical Notes

- See `src/bcs/distribution/CONTRACT.md`'s updated Data Contracts section and `OWNERSHIP.md`'s updated `prompt_usage` row for the exact column/retention details, and [PDR-013](../../docs/pdr/013-cli-side-git-context-tagging.md) for why exact-match (not timestamp inference) was chosen.
- This is additive-only to an existing table (nullable columns) — no backfill needed, old rows simply have nulls, consistent with this repo's established pattern for additive optional columns.
