---
epic: 011-vcs-integration
feature: 005-pr-evaluation-and-github-check-runs
status: open
dependencies: ["002-repo-project-linking", "003-required-skill-governance-policy", "004-cli-git-context-tagging-and-usage-query-api"]
---

# PR Evaluation & GitHub Check Runs

The core of the epic: when a PR opens or gets new commits, figure out which required skills ran and post that as a GitHub Check Run. This is the feature that actually answers "which skills were and weren't used on this branch."

## Requirements

- [ ] `handleGithubWebhook()` fully handles `pull_request` events (`opened`, `synchronize`, `reopened`) — for each, finds the matching `RepoLink` (by `githubRepoId`), resolves required skills via Prompt Registry's `listRequiredSkillsForProject(orgId, projectId)` (not a Governance call — see [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)), fetches the PR's full commit list from GitHub, and queries `queryUsageByRepoAndCommits` for matching usage rows.
- [ ] Required-skill matching is by **skill name only** and against **any commit reachable from the PR's branch history**, not exact-head-sha equality only — per `vcs-integration`'s `CONTRACT.md` Stability Guarantees, this specifically covers rebase/squash-merge cases from PDR-013.
- [ ] A `PrCheck` row is written, keyed on `(repoLinkId, prNumber, headSha)` — upserted on webhook redelivery of the same `deliveryId`/head sha, a new row on a new head sha (new `synchronize`).
- [ ] Webhook deliveries are deduped by GitHub's delivery id so a retried delivery doesn't double-process.
- [ ] A GitHub Check Run is posted/updated: `pass` if every required skill is satisfied, `fail` if any is missing (visibility only — **not configured as a required status check**, doesn't block merge), `neutral` if evaluation itself errored (e.g. Governance call threw) — fails loud, not silently.
- [ ] The Check Run's summary text lists which skills ran and which didn't, in plain language a PR author can act on.
- [ ] `PrEvaluated` audit event fires on every evaluation.

## Acceptance Criteria

- [ ] Opening a PR on a linked repo, where the branch's commits include a CLI invocation of every required skill, produces a `pass` Check Run.
- [ ] Opening a PR missing one required skill produces a `fail` Check Run whose summary names the missing skill.
- [ ] Pushing a new commit to an open PR triggers re-evaluation and updates the same Check Run (not a duplicate one).
- [ ] Redelivering the same webhook payload (simulate via GitHub's redelivery feature or a manual duplicate POST) does not create a duplicate `PrCheck` row or double-post a Check Run.
- [ ] Forcing a Governance-call failure (e.g. a broken project link) results in a `neutral` Check Run with a visible error, not a missing/absent one.
- [ ] Repo not linked to any project → webhook is a no-op (no Check Run posted, no error).

## Open Questions

None specific to this feature beyond the epic's already-flagged monorepo path-scoping simplification (evaluates per-repo, all linked projects' required skills apply regardless of which project's directory the PR actually touches).

## Dependencies

- `backlog/011-vcs-integration/002-repo-project-linking.md`
- `backlog/011-vcs-integration/003-required-skill-governance-policy.md`
- `backlog/011-vcs-integration/004-cli-git-context-tagging-and-usage-query-api.md`

## Technical Notes

- Per PDR-007 (synchronous in-process calls, no event bus/queue): process the webhook synchronously within the request handler — respond to GitHub once evaluation completes, no background job/queue at this scale.
- The actual HTTP route (`src/app/api/webhooks/github/route.ts`) is a thin Distribution-owned handler per `repo-structure.md` — it only verifies the request looks like a GitHub webhook shape and forwards straight into this BC's `handleGithubWebhook()`. Don't put evaluation logic in the route file itself.
- See `src/bcs/vcs-integration/CONTRACT.md`'s `PrCheck`/`RequiredSkillResult` data contracts and Failure Model entries in `docs/architecture.md` for the exact neutral/fail/pass semantics.
