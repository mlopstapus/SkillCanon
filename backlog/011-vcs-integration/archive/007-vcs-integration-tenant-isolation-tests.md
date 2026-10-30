---
epic: 011-vcs-integration
feature: 007-vcs-integration-tenant-isolation-tests
status: done
dependencies: ["001-github-app-registration-and-installation", "002-repo-project-linking", "005-pr-evaluation-and-github-check-runs"]
---

# VCS Integration Tenant Isolation Tests

Apply the reusable cross-tenant-denial pattern (built in `002-identity-access/007-tenant-isolation-tests-and-rls.md`) to this BC's three new tables, per tenets M1/M2/M3 — every prior bounded-context epic has its own version of this feature, this is this epic's.

## Requirements

- [x] RLS policies enabled on `vcs_integration.installations`, `vcs_integration.repo_links`, `vcs_integration.pr_checks`, keyed off the same session-variable mechanism as every other BC (`context/database-conventions.md`).
- [x] Every service-layer query in this epic's other features filters by the caller's `organization_id` — audited against this feature, not assumed.
- [x] One M3 negative test per resource type: an org A caller cannot read or write org B's `Installation`, `RepoLink`, or `PrCheck` by ID.
- [x] A specific test for the webhook-triggered path: `handleGithubWebhook()` resolves `orgId` from the `RepoLink`/`Installation` the incoming `githubRepoId`/`githubInstallationId` maps to — not from any caller-supplied value — since a webhook has no authenticated session to derive tenant context from the normal way.

## Acceptance Criteria

- [x] For every resource type owned by this BC, a test proves cross-org access by ID is denied — not just absent from a list view (reuse `assertCrossTenantDenied` from `src/shared/testing/tenant-isolation.ts`).
- [x] A forged webhook payload claiming a `githubRepoId`/`githubInstallationId` that maps to org A's `RepoLink` cannot be used to affect or read org B's data, even if the payload's other fields (e.g. PR author) reference an org B identity.
- [x] Disabling the app-layer `organization_id` filter (simulated in a test) still results in denial — RLS independently blocks it.

## Open Questions

None — this is the established pattern applied to a new BC, not new design.

## Dependencies

- `backlog/002-identity-access/007-tenant-isolation-tests-and-rls.md` (the shared test helper this feature reuses)
- `backlog/011-vcs-integration/001-github-app-registration-and-installation.md`
- `backlog/011-vcs-integration/002-repo-project-linking.md`
- `backlog/011-vcs-integration/005-pr-evaluation-and-github-check-runs.md`

## Technical Notes

The webhook-path tenant-resolution test above is the one genuinely new wrinkle this BC adds beyond the established pattern: every other BC resolves `organization_id` from an authenticated caller's session/API key, but a GitHub webhook has no such session — tenant context here is derived entirely from which `Installation`/`RepoLink` the GitHub-supplied ids map to. Get this test wrong and a maliciously crafted webhook payload becomes a cross-tenant vector unique to this BC.

## Done 2026-10-30

`src/bcs/vcs-integration/application/tenant-isolation.test.ts` covers read denial per table with RLS alone (no app filter), write denial (updates, cross-org inserts, `unlinkRepo`, `getPrCheck`), the webhook forgery cases, and that the app role cannot touch `webhook_deliveries`. RLS itself shipped in migrations 0036-0038 with each table. The query audit is in `specs/050-vcs-tenant-isolation/plan.md`.
