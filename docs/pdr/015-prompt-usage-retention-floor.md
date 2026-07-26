# PDR-015: `prompt_usage` Needs a Retention Floor Once PR Checks Depend On It

**Status:** Accepted
**Date:** 2026-07-25

## Context

`bcs/distribution/OWNERSHIP.md` currently describes `distribution.prompt_usage` as "Telemetry only... Not domain state; safe to truncate/roll up without affecting any bounded context's correctness." That characterization was true when the table's only consumer was usage dashboards/latency reporting. It stops being true once `vcs-integration` evaluates a PR by querying this table for every commit in the PR's history (PDR-013): if rows for a skill invocation made three weeks ago have already been truncated or rolled up by the time a long-lived PR is finally evaluated, the check silently and incorrectly reports "skill didn't run."

## Options Considered

### Leave `prompt_usage` as freely truncatable, accept the gap
Do nothing differently; document the risk and move on.
Pros: no new work.
Cons: silently defeats the entire feature for any PR that stays open longer than whatever ad hoc rollup cadence ops ends up running — exactly the kind of gap that isn't visible until it's already caused a wrong "required skill missing" result on someone's real PR.

### Set an explicit retention floor tied to realistic PR lifetime (chosen)
Distribution commits to retaining `prompt_usage` rows carrying non-null git-context fields (repo/branch/commit) for at least a fixed floor — proposed at 90 days, comfortably longer than the overwhelming majority of PRs stay open — before any future rollup/truncation job is allowed to touch them. Rows with no git context (non-CLI invocations) keep no such guarantee; they're still free to roll up on whatever cadence ops chooses.
Pros: closes the gap explicitly rather than leaving it as an undocumented assumption; scoped only to the rows that actually matter for this feature, not a blanket retention change to all telemetry.
Cons: `prompt_usage` is no longer uniformly "safe to truncate" — any future rollup job has to be written with this carve-out in mind, a small but real ongoing constraint.

## Decision

`distribution.prompt_usage` rows with a non-null `git_commit_sha` are retained for a minimum of 90 days regardless of any general telemetry rollup policy. `bcs/distribution/OWNERSHIP.md` is updated to state this explicitly rather than leaving the table's "safe to truncate" note stale and wrong.

## Consequences

- **Positive:** the PR-evaluation feature has a documented, honest guarantee about how far back it can look, instead of an implicit assumption that happens to work until it doesn't.
- **Negative:** any future rollup/truncation job for `prompt_usage` needs an explicit `WHERE git_commit_sha IS NULL` (or equivalent) carve-out — one more thing to get right when that job is eventually built.
- **Risks:** 90 days is a judgment call, not a measured figure (no production PR-lifetime data exists yet, pre-launch). Flagged as an open question in `architecture.md` to revisit once real usage data exists.
