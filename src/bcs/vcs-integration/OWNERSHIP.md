# VCS Integration — Ownership

**Owner:** Ben Anderson

## Folder Ownership

| Path | Ownership level |
|---|---|
| `/bcs/vcs-integration/` | Full |
| `src/bcs/vcs-integration/` (domain, application, infrastructure) | Full |
| `src/app/(app)/settings/integrations/github/**`, `src/app/(app)/projects/*/checks/**` (UI) | Full — embedded in Distribution's page shell per `repo-structure.md`, authored here |

## Database Ownership

Postgres schema: `vcs_integration`

| Schema / Table | Notes |
|---|---|
| `vcs_integration.installations` | One row per GitHub App installation; stores `github_installation_id`, account login/type, `suspended_at`. Never stores the App private key or installation access tokens — those are minted on demand from the App's private key (env-var secret) and never persisted. |
| `vcs_integration.repo_links` | Many-to-many join between a linked GitHub repo and a SkillCanon project. Unique on `(installation_id, github_repo_id, project_id)`. |
| `vcs_integration.pr_checks` | One row per `(repo_link_id, pr_number, head_sha)`; append-only across head shas, upserted within the same head sha on webhook redelivery. This is real domain state (a governance-compliance record), not disposable telemetry — no truncation/rollup job may touch it. |

## Shared Resource Ownership

None. The GitHub API client (Octokit) and webhook signature verification live in `src/bcs/vcs-integration/infrastructure/`, not `/shared/` — same isolation as Billing & Entitlements' Stripe SDK usage. No other context imports it.

## Dependencies (owned by others)

| Resource | Owned by BC |
|---|---|
| `listRequiredSkillsForProject(orgId, projectId)` | Prompt Registry |
| `queryUsageByRepoAndCommits(orgId, gitRemoteUrl, commitShas[])` | Distribution |
| Project/team existence checks | Identity & Access, Prompt Registry |
| `record()` (audit writes) | Audit & Compliance |
| Webhook route (`src/app/api/webhooks/github/route.ts`) — thin handler only, calls straight into this BC's `handleGithubWebhook()` | Distribution (route file ownership, per `repo-structure.md`) |
