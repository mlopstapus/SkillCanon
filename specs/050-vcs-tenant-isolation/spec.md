# Feature Specification: VCS Integration Tenant Isolation Tests

**Branch**: `feat/011-007-tenant-isolation` | **Created**: 2026-10-30 | **Depends on**: 011/001, 002, 005 | **Input**: backlog/011-vcs-integration/007

## Scenarios
- An organization cannot read or write another organization's installation, repo link or PR check by id, proven with RLS alone (no app-layer filter) and through the application functions.
- A forged webhook payload can only reach the tenant its stored repo link and installation name; identifiers of another org in the payload have no effect.
- Webhook bookkeeping (delivery ids) is unreachable by the app role.

## Requirements
- FR-001 RLS on `installations`, `repo_links`, `pr_checks`, `webhook_deliveries` (delivered in migrations 0036-0038; verified here).
- FR-002 Every service-layer query filters by organization; the deliberately unfiltered ones (webhook resolution of a link/installation by GitHub id) run only as the webhook role and are listed in plan.md.
- FR-003 One negative test per resource type using `assertCrossTenantDenied`, plus write denial, plus the forged-webhook test.

## Success Criteria
Every resource type has a passing cross-tenant denial test; the forged-payload test shows zero rows for the other org.
