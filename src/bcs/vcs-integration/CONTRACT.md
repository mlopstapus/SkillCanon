# VCS Integration — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns `Installation`, `RepoLink`, and `PrCheck` — the bridge between a SkillCanon project's required skills (a Prompt Registry catalog fact, not a Governance concern — see [PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md)) and a real GitHub repository's pull requests. Answers one question: *for this PR, which required skills ran on its commits, and which didn't?* Surfaces that as visibility (a dashboard view and a GitHub Check Run) — MVP does not block merges. This is the sole anti-corruption layer in front of GitHub's REST/webhook API and the GitHub App private key, the same isolation pattern Billing & Entitlements already uses for Stripe (`architecture.md`) — no other context imports an Octokit client or parses a raw GitHub payload. It calls Prompt Registry and Distribution through their read contracts only, and never queries `prompt_registry.*` or `distribution.*` tables directly. See [PDR-012](../../../docs/pdr/012-vcs-integration-new-bounded-context.md), [PDR-013](../../../docs/pdr/013-cli-side-git-context-tagging.md), [PDR-014](../../../docs/pdr/014-github-app-not-pat.md), [PDR-016](../../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md).

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `handleGithubWebhook(rawBody, signatureHeader, deliveryId)` | Verifies the HMAC signature, dedupes by `deliveryId`, dispatches on event type (`installation`, `installation_repositories`, `pull_request`: `opened`/`synchronize`/`reopened`). For a PR event, evaluates required skills and posts/updates a GitHub Check Run. | Distribution (thin webhook route handler) |
| `linkRepo(orgId, projectId, installationId, githubRepoId, actingUserId)` | Links a GitHub repo (within an installation) to a SkillCanon project. Many-to-many — a repo may link to multiple projects (monorepo case) and a project may span multiple repos. | Distribution (route handlers, UI) |
| `unlinkRepo(orgId, repoLinkId, actingUserId)` | Removes a repo↔project link. Does not delete PR-check history. | Distribution (route handlers) |
| `listInstallations(orgId)` | GitHub App installations visible to this org. | Distribution (admin UI) |
| `listRepoLinks(orgId, projectId?)` | Repo links, optionally filtered to one project. | Distribution (UI) |
| `getPrCheck(orgId, repoLinkId, prNumber)` | Latest evaluation plus history for one PR. | Distribution (dashboard UI) |

## Events Published

| Event | Payload summary | Consumers |
|---|---|---|
| `InstallationCreated` / `InstallationSuspended` / `InstallationDeleted` | orgId, installationId, githubAccountLogin | Audit |
| `RepoLinked` / `RepoUnlinked` | orgId, repoLinkId, projectId, githubRepoFullName, actorUserId | Audit |
| `PrEvaluated` | orgId, repoLinkId, prNumber, headSha, satisfiedSkills, missingSkills | Audit |

## Events Consumed

None — this context is triggered externally by GitHub webhook deliveries, not by another BC's domain event. It reaches into Governance and Distribution via direct synchronous calls (per [PDR-007](../../../docs/pdr/007-synchronous-in-process-contexts.md)), not event subscription:

- `listRequiredSkillsForProject(orgId, projectId)` — Prompt Registry (see its `CONTRACT.md`)
- `queryUsageByRepoAndCommits(orgId, gitRemoteUrl, commitShas[])` — Distribution (new API, see its `CONTRACT.md`)

## Data Contracts

```ts
interface Installation {
  id: string; orgId: string;
  githubInstallationId: number;
  githubAccountLogin: string;
  githubAccountType: "Organization" | "User";
  suspendedAt: string | null;
}

interface RepoLink {
  id: string; orgId: string;
  installationId: string;
  githubRepoId: number;
  repoFullName: string; // "owner/repo"
  projectId: string;
  linkedByUserId: string;
}

interface RequiredSkillResult {
  skillName: string;
  satisfied: boolean;
  matchedCommitSha: string | null; // the commit whose usage row satisfied this, if any
}

interface PrCheck {
  id: string; repoLinkId: string;
  prNumber: number;
  headSha: string;
  evaluatedAt: string;
  results: RequiredSkillResult[];
  status: "pass" | "fail" | "neutral"; // neutral = evaluation itself errored (e.g. Governance call failed)
  githubCheckRunId: number | null;
}
```

## Stability Guarantees

`PrCheck` is keyed on `(repoLinkId, prNumber, headSha)` — one row per head sha, upserted on webhook redelivery (same `deliveryId`), a new row on a new `synchronize` (new head sha). A required skill is matched by **skill name only**, not name+version, and against **any commit reachable from the PR's branch history at evaluation time**, not exact-head-sha equality only — this degrades gracefully around rebases/squash-merges per PDR-013's Risks. Changing either of those matching rules changes what "satisfied" has meant for every previously-evaluated PR and requires a PDR.

## Breaking Change Policy

Any change to required-skill matching semantics (name-only vs. name+version, exact-sha vs. reachable-history) requires a PDR, since it silently redefines pass/fail for every linked repo's history. GitHub webhook/Check Run payload shapes are GitHub's contract, not ours — this BC absorbs their changes internally; no consumer of this BC's own exposed APIs is affected by a GitHub-side API version bump.
