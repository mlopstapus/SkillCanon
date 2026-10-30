# Implementation Plan: GitHub App Registration & Installation

**Branch**: `feat/011-001-github-app` | **Spec**: [spec.md](spec.md)

## Summary

New `vcs_integration` schema with `installations` (soft delete) and `webhook_deliveries`. App settings read from env; inert when unset. GitHub is reached through `fetch` plus a hand-signed RS256 app JWT (no Octokit dependency; the whole client is ~80 lines inside `src/bcs/vcs-integration/infrastructure/`, still the sole anti-corruption layer).

## Decisions

- **Roles/RLS**: `skillcanon_app` gets a tenant-scoped policy (UI); `skillcanon_auth` gets a permissive policy (webhook has no session). `webhook_deliveries` is reachable by `skillcanon_auth` only. No DELETE grants.
- **Install state**: HMAC-SHA256 over `{org,user,exp}` keyed from the webhook secret, 15 min TTL; callback requires the same signed-in admin.
- **Webhook**: signature over raw body (constant-time); claim of delivery id and handling in one transaction so a failure lets GitHub's retry run; org only from the stored installation. `created` is not attributable (no org marker) so the callback records rows; `pull_request` acknowledged and ignored until feature 005.
- **Audit**: `vcs_installation.created|updated|deleted` (suspend/unsuspend are `updated` with before/after) via `record()`, transport `web` or `system`.
- **Octokit**: deliberately not added; revisit only if later features outgrow the small client.

## Structure

`src/bcs/vcs-integration/{domain,application,infrastructure}`, thin routes `src/app/api/webhooks/github/route.ts` and `src/app/api/integrations/github/callback/route.ts`, page `src/app/(app)/settings/integrations/github/`, migration `0036_vcs_integration_installations`.

## Testing

Testcontainers tests for the install, webhook and RLS paths against a stubbed GitHub; unit tests for signatures, JWT, token redaction.
