---
epic: 002-identity-access
feature: 008-authdb-consumer-handoff
status: open
dependencies: ["007-tenant-isolation-tests-and-rls.md"]
---

# `authDb` Consumer Handoff for Distribution

`007-tenant-isolation-tests-and-rls` introduced a second Postgres role, `skillcanon_auth`, required by every identity-access function that must resolve an identity or bootstrap a tenant *before* any organization context exists. No route handler or MCP tool exists yet in this codebase (all deferred to epic `008-distribution`), so nothing outside this bounded context's own tests has had to get this right yet. This item exists purely to make sure that first real consumer doesn't rediscover — or silently get wrong — which connection each function needs.

## Requirements

- [ ] Every `008-distribution` route handler or MCP tool that calls one of the six `authDb`-requiring functions (`login`, `authenticateSession`, `authenticateApiKey`, `acceptInvitation`, `logout`, `bootstrapOrganization`/`registerFirstRunAdmin` — the only two org-bootstrap functions actually exported for Distribution to call; `createOrganization` is `bootstrapOrganization`'s internal, non-exported helper) uses `shared/db/client.ts`'s `authDb` export for that call, not the ordinary `db`
- [ ] Every other exposed identity-access function is called only after the request's own `organizationId`/`actingUser.orgId` is known, wrapped in `withTenantContext(db, organizationId, ...)` — never called against a bare, unscoped `db`/`appDb`-equivalent connection
- [x] `logout`'s indirect dependency on this (it calls `getUser` with no org context, since it only ever receives a bare `userId`) is specifically covered by a test or code-review checklist item, not just inferred from the function list above — see `CONTRACT.md`'s "Connection Requirements" section (specs/012-authdb-consumer-handoff), which gives `logout` its own standalone bullet

## Acceptance Criteria

- [ ] `bcs/identity-access/CONTRACT.md`'s per-function `authDb`-required notes (added by `007-tenant-isolation-tests-and-rls`) are followed exactly by every route/tool added in `008-distribution`'s `001-rest-api-core-routes.md` and `002-mcp-server-and-tools.md`
- [ ] A code review of `008-distribution`'s implementation explicitly checks this against `CONTRACT.md` before merge — the same way a new tenant-scoped table gets checked for RLS

## Open Questions

- None — the exact list of functions and their required connection is already fully enumerated in `bcs/identity-access/CONTRACT.md` and `specs/011-tenant-isolation-rls/data-model.md`.

## Dependencies

- `007-tenant-isolation-tests-and-rls.md` (this epic, already delivers the `authDb` role/client and the `CONTRACT.md` notes this item exists to make sure get followed)
- `backlog/008-distribution/001-rest-api-core-routes.md` and `002-mcp-server-and-tools.md` (the actual consumers — see the tracking notes added there)

## Technical Notes

This is a "make sure a forward dependency doesn't get missed" item, not new design or new code within this bounded context — `007-tenant-isolation-tests-and-rls` already builds everything (`authDb`, the role, the `CONTRACT.md` notes) this item depends on being *used* correctly. Discovered mid-implementation of that feature: `logout`'s indirect, easy-to-miss dependency on `authDb` (via its own internal `getUser` call with no organization context) surfaced only while migrating this bounded context's existing test suite to real RLS — the same class of oversight a future route/tool author could just as easily make without a written checklist to check against.
