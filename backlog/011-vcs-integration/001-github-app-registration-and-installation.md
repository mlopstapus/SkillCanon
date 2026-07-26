---
epic: 011-vcs-integration
feature: 001-github-app-registration-and-installation
status: open
dependencies: []
---

# GitHub App Registration & Installation

Register the SkillCanon GitHub App and build the `Installation` aggregate — the credential and account-linking foundation everything else in this epic depends on. Without this, there is no authenticated way to talk to GitHub at all.

## Requirements

- [ ] A GitHub App is registered (manually, once, by the maintainer) with permissions `checks:write`, `pull_requests:read`, `contents:read`, `metadata:read`, subscribed to `installation`, `installation_repositories`, and `pull_request` webhook events.
- [ ] The App's private key is stored as an env-var secret (`GITHUB_APP_PRIVATE_KEY` or equivalent), never committed — same convention as every other credential in this repo (SMTP, Sentry DSN, Postgres creds).
- [ ] An "Install SkillCanon on GitHub" flow in the web UI redirects to GitHub's App installation page and handles the callback, creating an `Installation` row (`vcs_integration.installations`) on success.
- [ ] `installation` webhook events (`created`, `deleted`, `suspend`, `unsuspend`) update the corresponding `Installation` row's `suspendedAt` field or remove it.
- [ ] Installation access tokens are minted on demand from the App's private key per GitHub's standard exchange, never persisted beyond the request that used them.
- [ ] `listInstallations(orgId)` is implemented and exposed per `CONTRACT.md`.
- [ ] Every `InstallationCreated`/`InstallationSuspended`/`InstallationDeleted` writes an audit event via `record()`.

## Acceptance Criteria

- [ ] Installing the App on a test GitHub org creates exactly one `Installation` row with the correct `githubInstallationId`, `githubAccountLogin`, `githubAccountType`.
- [ ] Suspending the installation in GitHub's UI updates `suspendedAt` within one webhook delivery.
- [ ] Deleting the installation removes the `Installation` row (or marks it deleted — see Open Questions) and existing `RepoLink`/`PrCheck` rows referencing it don't orphan-crash any read path.
- [ ] No installation access token or the App private key ever appears in application logs.

## Open Questions

- On `installation.deleted`, hard-delete the `Installation` row or soft-delete (keep for audit history, since `PrCheck` history for its repos should presumably remain queryable)? Given this repo's hard-FK, hard-delete-everywhere default (`docs/context/database-conventions.md`), soft-delete here would be the exception — decide during implementation, default to hard-delete unless it breaks `PrCheck` history queries.

## Dependencies

None — this is the first feature in the epic.

## Technical Notes

- Per [PDR-014](../../docs/pdr/014-github-app-not-pat.md): GitHub App, not PAT. Webhook signature verification (HMAC via the App's webhook secret) belongs here too, even though most webhook *handling* logic lands in feature 005 — this feature's `handleGithubWebhook()` skeleton should verify signatures and dispatch, with `installation`-event handling fully implemented now and `pull_request`-event handling stubbed until feature 005.
- Octokit (`@octokit/app`, `@octokit/webhooks`) is the recommended client — isolated entirely inside `src/bcs/vcs-integration/infrastructure/`, per `OWNERSHIP.md`'s "sole anti-corruption layer" note. No other BC imports it.
- See `src/bcs/vcs-integration/CONTRACT.md`'s `Installation` data contract and `OWNERSHIP.md`'s database ownership table for the exact schema shape.
