---
epic: 008-distribution
feature: 001-rest-api-core-routes
status: done
dependencies: ["backlog/002-identity-access/EPIC.md", "backlog/005-governance/EPIC.md", "backlog/006-prompt-registry/EPIC.md", "backlog/000-foundations/004-api-and-error-conventions.md"]
---

# REST API Core Routes

Port the REST surface from the current Python `routers/*.py` — teams, projects, prompts, policies, objectives, workflows, api-keys — as Next.js route handlers calling into each BC's application-service contract, using the error-mapping approach from the API conventions foundations item.

## Requirements

- [x] Route handlers for every resource currently exposed by `routers/{teams,projects,prompts,policies,objectives,workflows,apikeys,users}.py`, matching or improving on current URL/method conventions per `context/api-conventions.md` — `workflows` is ported as skill-chain routes (`/api/skills/{name}/chain-runs`, `/api/chain-runs/{runId}/*`) per PDR-017's already-decided fold of workflow-orchestration into Prompt Registry, not a literal `/workflows` resource. One legacy operation, team deletion, has no route: no `identity-access` application function performs a team deletion (only create/update/reparent/insert-between exist) — documented as a pre-existing BC-layer gap, not invented at the route layer. See `specs/027-rest-api-core-routes/contracts/teams-users-apikeys.contract.md`.
- [x] Every route authenticates via `authenticateSession` (cookie) for the web UI's own calls — **and calls it (plus `login`, `authenticateApiKey`, `acceptInvitation`, `logout`, and the org-bootstrap flow) with `shared/db/client.ts`'s `authDb`, never the ordinary `db`** — `src/shared/api/auth.ts`'s `resolveCaller` is the only file in `src/shared/api` that imports `authDb`; every other route derives its DB access from the caller's already-resolved `organizationId` via `withTenantContext`.
- [x] Every route handler calls only the owning BC's exposed contract functions — no direct DB/model access from Distribution (module-boundary lint enforces this) — verified: `pnpm lint` passes with zero `boundaries/dependencies` findings across all 38 route files.
- [x] Shared error-mapping layer translates domain errors to the REST error shape from `context/api-conventions.md` consistently across all routes — `src/shared/api/errors.ts`, a name-keyed registry over ~60 existing domain error classes (no `DomainError` base-class retrofit — see `specs/027-rest-api-core-routes/research.md`'s architecture decision), verified by a dedicated cross-resource test (`src/shared/api/cross-resource-error-shape.test.ts`).

## Acceptance Criteria

- [x] Each ported resource's CRUD operations behave equivalently to the current Python API for the equivalent request (characterization-style comparison where practical) — verified via Testcontainers-backed integration tests per route (288 tests total across 41 test files, all green).
- [x] A domain error (e.g. "policy not found") produces the same error shape regardless of which route handler triggered it — verified directly by `cross-resource-error-shape.test.ts` across not-found/validation/authorization-denial/cross-org/unhandled-error cases spanning unrelated resources.
- [x] Module-boundary lint passes — no route handler imports a BC's schema/model files directly.

## Open Questions

- None — resolved via `/speckit-clarify` before implementation (see `specs/027-rest-api-core-routes/spec.md`'s Clarifications): no synchronous chain "run to completion" endpoint; every route (including admin/CRUD writes) accepts either a session or an API key.

## Dependencies

- All five prior bounded-context epics (002, 003, 004, 005, 006)
- `backlog/000-foundations/004-api-and-error-conventions.md`

## Technical Notes

Implemented via `specs/027-rest-api-core-routes/` (spec/plan/research/data-model/contracts/tasks). Split into per-resource groups as anticipated by this file's own note: teams+users+api-keys, projects (+members/collaborator-teams/repos/skill-assignments/objectives/metrics), skills (+versions/rollback/subscriptions/fork/expand/chain-runs), policies, objectives — 38 route files, 2 new shared modules (`src/shared/api/auth.ts`, `errors.ts`, plus `handler.ts`/`pagination.ts`/`test-helpers.ts`), zero new DB migrations.

Two small, additive shared/barrel changes were needed and are documented in `research.md`, distinct from the "zero BC file changes" claim (which refers specifically to `domain`/`application`/`infrastructure` files):
- `src/bcs/identity-access/index.ts` gained ~14 error-class re-exports, matching the pattern `governance`'s and `prompt-registry`'s barrels already used (identity-access's barrel exported none of its own error classes before this feature — a pre-existing gap, not something this feature invented).
- `src/shared/logging/index.ts` gained `getLogger(bc)`, fulfilling `docs/context/api-conventions.md`'s already-documented (but until now unimplemented) logging convention.

Several BC function signatures diverged from `docs/context/api-conventions.md`-era assumptions and this feature's own initial contract drafts (corrected in `specs/027-rest-api-core-routes/research.md` and each `contracts/*.md` file) — most notably: `createApiKey` has no target-user parameter (self-only, by design); `createProject`/`createPolicy`/`createObjective` require a mandatory identity/scope verifier callback set, not a bare params object; `createPrompt` has no `ownerType`/`ownerId` (a skill is always owned by its creating user, PDR-016); `deletePolicy` is a soft delete. None of these required a BC change — only correcting the route layer's assumptions about already-shipped behavior.
