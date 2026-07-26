# PDR-013: Client-Side Git-Context Tagging for Skill-Usage↔Commit Correlation

**Status:** Accepted
**Date:** 2026-07-25

## Context

To show which skills ran on a PR, a skill invocation needs to be tied to a specific repo/branch/commit. The `skillcanon` CLI already runs inside the user's repo at invocation time (per [PDR-010](010-skill-based-distribution-not-mcp.md)/[PDR-011](011-skill-sync-cli-and-drift-detection.md)) and already calls the REST expand endpoint live — it has direct access to local git state at the exact moment a skill fires.

## Options Considered

### Server-side reconstruction after the fact
Keep usage telemetry git-agnostic. When a GitHub webhook fires (PR opened/synchronize), pull the commit list and infer which skill invocations "belong" to the PR by matching timestamps and the invoking user against `PromptUsage` rows.
Pros: zero client-side change; works even for skill invocations from tools other than the `skillcanon` CLI.
Cons: inherently probabilistic — a user can run a skill, work on an unrelated branch for twenty minutes, then push; timestamp-only correlation produces false positives and false negatives with no way to distinguish them from real usage. This is exactly the kind of "looks done, silently wrong" gap that undermines the whole point of a governance feature — a false "skill ran" is worse than an honest "unknown."

### CLI-side git-context tagging (chosen)
Extend the `skillcanon` CLI to read the local repo's remote URL, current branch, and current commit sha at the moment a skill invocation calls the expand endpoint, and send them alongside the existing telemetry payload.
Pros: exact, not inferred — a usage row says "this skill ran at this commit," a fact rather than a guess; matches this repo's general "correctness over inference" posture (e.g. governance resolution's read-fresh, fail-closed design).
Cons: only covers invocations that go through the `skillcanon` CLI in a real git repo (an invocation from the web UI's ad hoc `sh-run`-equivalent, or a bare non-git directory, has no git context — those rows simply have null repo/branch/commit fields, same as any other optional telemetry); commit shas can still go stale relative to the PR's final history (see Risks).

## Decision

Extend the CLI's existing invocation call to include `gitRemoteUrl`, `gitBranch`, and `gitCommitSha` (all nullable) as additional fields on the same request that already writes a `PromptUsage` row (`bcs/distribution/CONTRACT.md`). No new endpoint — this is additive to the existing telemetry write path.

## Consequences

- **Positive:** exact, non-probabilistic correlation; no new client-server round trip; degrades gracefully (null fields) outside a git repo rather than failing.
- **Negative:** ties correlation quality to the CLI actually running inside the same repo/branch the PR is opened from — an invocation run from a detached-HEAD state, a separate worktree, or a local branch that gets squash-merged (so the exact recorded sha never appears in the PR's final commit list) won't have an exact-sha hit at evaluation time.
- **Risks:** commit-matching at PR-evaluation time must therefore match against **any commit reachable from the PR's branch history at the time of evaluation**, not just an exact head-sha equality check, or the squash-merge/rebase case above silently produces false "skill didn't run" negatives. `vcs-integration`'s evaluation logic is designed around this (see its `CONTRACT.md`), not left as a known bug.
