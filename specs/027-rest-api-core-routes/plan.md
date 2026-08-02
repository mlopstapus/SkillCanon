# Implementation Plan: REST API Core Routes

**Branch**: `027-rest-api-core-routes` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

## Summary

Builds the REST surface for the self-hosted Free tier: Next.js App Router route handlers under `src/app/api/**` that call only their owning bounded context's already-exposed application functions (`identity-access`, `governance`, `prompt-registry`) — teams, users, API keys, projects (+ members/collaborator teams/repos), skills/prompts (+ versions/rollback/subscriptions/fork/project-assignment/expand/skill-chain runs), policies, objectives. Two new shared Distribution-owned modules do the cross-cutting work every route needs: `src/shared/api/auth.ts` resolves the caller from either a session cookie or an API-key bearer token (uniformly, on every route — 2026-08-02 clarification), and `src/shared/api/errors.ts` maps the ~60 existing per-BC domain error classes (all plain `extends Error` subclasses today — no `DomainError` base exists in code despite `docs/context/api-conventions.md`'s original design sketch) to one consistent `{ error: { code, message, details? } }` REST shape via a name-keyed registry, so every route gets FR-012/013/014 for free without any BC file changing. No synchronous chain "run to completion" endpoint (2026-08-02 clarification) — the step-by-step protocol is exposed as-is.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20)

**Primary Dependencies**: Next.js 16 App Router route handlers (`src/app/api/**/route.ts`), Zod (request body/query validation — not yet a dependency; added by this feature), Drizzle ORM (postgres-js) via `@/shared/db`'s `db`/`authDb`/`withTenantContext`, `@/bcs/identity-access`, `@/bcs/governance`, `@/bcs/prompt-registry`, `@/bcs/audit-compliance` (`AuditContext`, transport `"api"`), `@/shared/logging` (`getLogger("distribution")`), Vitest (Testcontainers-backed integration tests calling route handlers' exported `GET`/`POST`/etc. functions directly with a constructed `Request`/`NextRequest`, per this repo's existing route-handler-as-function testing convention — no HTTP server is spun up).

**Storage**: PostgreSQL — no new tables or migrations. Every route wraps its BC call(s) in `withTenantContext(db, organizationId, fn)` using the caller's resolved `organizationId`; the two auth-resolution reads that must run before an org is known (`authenticateSession`, `authenticateApiKey`) use `authDb` directly, unwrapped (per `backlog/002-identity-access/008-authdb-consumer-handoff.md`).

**Testing**: Vitest, Testcontainers-backed, `startTestDb()` + `withTenantContext(testDb.appDb, orgId, ...)` fixtures for seeding, then invoking each route handler's exported function directly with a hand-built `Request` (headers for cookie/bearer auth, JSON body). One shared test helper (`src/shared/api/test-helpers.ts`) builds a `Request` with either a session cookie or `Authorization: Bearer <key>` header, and a fake-session-cookie signer reusing `identity-access`'s own JWT helpers (no live login flow needed per test). Every resource gets: happy-path CRUD, one authorization-denial case, one cross-org (not-found-shaped) case, and one validation-failure case, satisfying SC-001/002/003. A dedicated error-mapper unit-test file (no DB) exercises the full ~60-class registry plus the unhandled-error fallback, satisfying SC-002's "identical shape across resources" claim structurally rather than by re-deriving it per route test.

**Target Platform**: Linux server (self-hosted Docker Compose / Kubernetes-via-Helm), single unified Next.js app — no new services.

**Project Type**: Single unified Next.js app. This feature is Distribution-layer only: new route handlers plus two new small shared modules (`src/shared/api/auth.ts`, `src/shared/api/errors.ts`). Zero changes to any BC's `domain`/`application`/`infrastructure` files — every route calls only what's already exported from each BC's barrel (constitution D1/D2 — no BC file needs editing for this feature to satisfy FR-001 through FR-017).

**Performance Goals**: No new performance envelope; matches every other feature in this repo (no stated req/s target).

**Constraints**: FR-010's dual-mode auth must resolve *before* any resource is read (checked in `resolveCaller`, called first in every route). FR-011/M3's cross-org denial must be indistinguishable from not-found — achieved for free everywhere RLS already covers the underlying table (per the `026-skill-chains`/`022-project-skill-assignment` precedent: `withTenantContext` scopes every query, so a cross-org id is simply invisible, producing the BC's own `*NotFoundError` naturally) and reinforced by the error mapper never adding a distinguishing "forbidden, but it exists" code for `*NotFoundError` classes. FR-016's authDb/db split is enforced by *only* `resolveCaller` ever importing `authDb` — no route handler imports `authDb` directly. FR-017 (no BC internal-layer imports from a route handler) is already enforced today by `eslint-plugin-boundaries`' existing `src/app` element policy (whole-subtree match covers `src/app/api/**` with zero config changes — verified directly, see research.md).

**Scale/Scope**: 38 route handler files under `src/app/api/**` across 5 resource groups (teams+reparent, users+api-keys, projects, skills+versions+sharing+expand+chain-runs, policies+objectives — see `tasks.md` for the exact enumeration), 4 new shared modules (`auth.ts`, `errors.ts`, `handler.ts`, `pagination.ts`, plus a test-helpers module), 0 new DB migrations, 0 BC file changes. Per the originating backlog item's own note, implementation is organized and executed resource-group by resource-group even though tracked as one feature/spec.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Test-First (P1)**: Every route handler ships with a Testcontainers-backed integration test written alongside it (happy path + auth-denial + cross-org + validation), plus the standalone error-mapper unit test. No production route logic lands without a preceding failing test.
- **II. Domain-Driven Bounded Contexts (D1)**: Every route handler imports only its owning BC's public barrel (`@/bcs/identity-access`, `@/bcs/governance`, `@/bcs/prompt-registry`) — never a BC's `domain`/`application`/`infrastructure` file directly. `eslint-plugin-boundaries`' existing `app`-element policy already enforces this with zero config changes (verified directly; see research.md).
- **III. Domain Invariants in Domain Layer (D2)**: No new business rules are introduced by this feature — every authorization/validation rule already lives in the BC application layer being called (e.g. `createTeam`'s admin-only check, `expand`'s access check). Route handlers do request parsing, auth resolution, and error mapping only.
- **IV. Multi-Tenant Isolation (M1-M3)**: Every mutating/reading route resolves `organizationId` from the authenticated caller (never from the request body/path) and wraps its BC call in `withTenantContext(db, organizationId, fn)`. A negative cross-org test is included per resource (SC-003).
- **V. Secure by Default (S1-S3)**: No new secret handling beyond what `authenticateApiKey`/`authenticateSession` already do. The error mapper's 500 fallback never serializes `err.stack`/`err.message` from an unrecognized error into the response body — only a generic message; the real error is logged server-side via `shared/logging` (`err` field, S3-compliant).
- **VI. Auditable & Compliant (C1-C2)**: No new audit-writing logic — every mutating route calls a BC function that already writes its own audit event via `record()`; this feature only threads a REST-specific `AuditContext` (`{ transport: "api", sourceIp }`, derived from the resolved caller's request) into each call instead of letting it default to `DEFAULT_WEB_AUDIT_CONTEXT`, so a REST-triggered mutation shows up correctly attributed in the audit log's transport column.
- **VII. Feature-Gated by Entitlement (G1)**: No new entitlement checks — routes simply surface whatever the underlying BC function itself already gates (e.g. `EntitlementRequiredError`), mapped to 403 like any other domain error.

**Result**: PASS. No violations requiring justification.

**Post-design re-check** (after Phase 1): No changes. The error-mapper registry approach (vs. retrofitting a `DomainError` base class into ~60 existing error classes across 3 BCs) is the one deliberate architectural deviation from `docs/context/api-conventions.md`'s original code sketch — captured in Complexity Tracking below, not a constitution violation (D1/D2 are about *where* rules live, not about a specific base-class shape; FR-012/013/014's actual observable behavior is met either way).

## Project Structure

### Documentation (this feature)

```text
specs/027-rest-api-core-routes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output (REST resource/response shapes; no new DB entities)
├── quickstart.md         # Phase 1 output
├── contracts/
│   ├── error-shape.contract.md
│   ├── teams-users-apikeys.contract.md
│   ├── projects.contract.md
│   ├── skills.contract.md
│   └── policies-objectives.contract.md
├── checklists/
│   └── requirements.md   # Carried over from /speckit-clarify
└── tasks.md              # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/shared/api/
├── auth.ts                 ← NEW: resolveCaller(request): Promise<ResolvedCaller | null>
│                                (dual-mode: Authorization: Bearer <key> via authenticateApiKey,
│                                else session cookie via authenticateSession; both against authDb)
├── errors.ts                ← NEW: mapError(err: unknown): { status: number; body: ErrorBody }
│                                (name-keyed registry over every existing BC error class + Zod
│                                ZodError → 422 + unhandled → 500; no DomainError retrofit)
├── errors.test.ts            ← NEW: exercises full registry + fallback, no DB
├── handler.ts                ← NEW: withApiRoute(fn) wrapper — resolves caller, 401s if null,
│                                catches thrown errors through mapError, logs via shared/logging
├── pagination.ts              ← NEW: parsePageParams(url): { page, pageSize } (shared page/page_size
│                                query parsing + validation, FR-015)
└── test-helpers.ts             ← NEW: buildSessionCookieRequest(...), buildApiKeyRequest(...) for
                                    integration tests

src/app/api/
├── teams/
│   ├── route.ts                          ← POST (create), GET (list; query parentTeamId?, flat?)
│   ├── route.test.ts
│   └── [teamId]/
│       ├── route.ts                      ← GET, PUT, DELETE
│       ├── route.test.ts
│       ├── insert-parent/route.ts        ← POST (insertTeamBetween: new team inserted above [teamId])
│       │   + route.test.ts
│       └── reparent/route.ts             ← POST (reparentTeam: updateTeam excludes hierarchy changes)
│           + route.test.ts
├── users/
│   ├── route.ts                          ← POST (create, admin-only), GET (list; query teamId?)
│   ├── route.test.ts
│   └── [userId]/
│       ├── route.ts                      ← GET, PUT, DELETE (deactivate)
│       ├── route.test.ts
│       └── api-keys/route.ts             ← POST (create), GET (list) — self-or-admin
│           + route.test.ts
├── api-keys/
│   └── [keyId]/route.ts                  ← DELETE (revoke) — self-or-admin
│       + route.test.ts
├── projects/
│   ├── route.ts                          ← POST, GET (query teamId?)
│   ├── route.test.ts
│   └── [projectId]/
│       ├── route.ts                      ← GET, PUT, DELETE
│       ├── route.test.ts
│       ├── members/route.ts              ← POST, GET
│       ├── members/[userId]/route.ts     ← DELETE
│       ├── teams/route.ts                ← POST (collaborator), GET
│       ├── teams/[teamId]/route.ts       ← DELETE
│       ├── repos/route.ts                ← POST, GET
│       ├── repos/[repoId]/route.ts       ← DELETE
│       ├── skills/route.ts               ← POST (assign), GET (list assignments)
│       ├── skills/[skillId]/route.ts     ← DELETE (unassign)
│       ├── objectives/route.ts           ← POST, GET (project-scoped objectives)
│       ├── metrics/route.ts              ← GET (getProjectMetrics)
│       └── (+ one route.test.ts per file above)
├── skills/
│   ├── route.ts                          ← POST, GET (query projectId?, page, pageSize)
│   ├── route.test.ts
│   └── [name]/
│       ├── route.ts                      ← GET, DELETE (deprecate)
│       ├── route.test.ts
│       ├── versions/route.ts             ← POST (publish), GET (list)
│       ├── rollback/route.ts             ← POST (body: version)
│       ├── expand/route.ts               ← POST (body: input, version?, projectId?)
│       ├── subscriptions/route.ts        ← POST (subscribe), GET (list)
│       ├── subscriptions/[subscriptionId]/route.ts  ← DELETE (unsubscribe)
│       ├── fork/route.ts                 ← POST (body: ownerType, ownerId)
│       ├── chain-runs/route.ts           ← POST (start), GET (list)
│       └── (+ one route.test.ts per file above)
├── chain-runs/
│   └── [runId]/
│       ├── route.ts                      ← GET (getSkillChainRun)
│       ├── advance/route.ts              ← POST (report: stepIndex, status, output?, error?)
│       ├── abandon/route.ts              ← POST
│       └── (+ one route.test.ts per file above)
├── policies/
│   ├── route.ts                          ← POST, GET (query teamId?)
│   ├── effective/route.ts                ← GET (query userId?)
│   ├── route.test.ts
│   └── [policyId]/route.ts               ← GET, PUT, DELETE
│       + route.test.ts
└── objectives/
    ├── route.ts                          ← POST, GET (query teamId? | userId? | projectId?)
    ├── effective/route.ts                ← GET (query userId?, projectId?)
    ├── route.test.ts
    └── [objectiveId]/route.ts            ← GET, PUT, DELETE
        + route.test.ts
```

No `eslint.config.mjs` change: the existing `boundaries/elements` `app` entry (`src/app`, whole-subtree match) already restricts every file under `src/app/api/**` to each BC's barrel import — verified directly (see `research.md`), not assumed.

**Structure Decision**: All new code lives in two places: a small shared `src/shared/api/` module pair (auth resolution + error mapping — the two genuinely cross-cutting concerns every route needs) and `src/app/api/**` route handlers organized by resource, one directory per resource matching Next.js's file-system routing. Sub-resources (project members/teams/repos/skills, skill versions/subscriptions/chain-runs) nest under their parent resource's directory rather than becoming top-level routes, mirroring the owning BC function's own parameter shape (e.g. `addProjectMember(orgId, projectId, userId)` naturally becomes `POST /api/projects/{projectId}/members`). `chain-runs/{runId}/*` is the one exception living outside `skills/` — once a run exists it's addressed by its own id, not its originating skill's name, matching `advanceSkillChainRun`/`abandonSkillChainRun`/`getSkillChainRun`'s own `(db, actor, runId, ...)` signatures (no `promptName` parameter). No BC folder (`src/bcs/**`) is touched.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations. Two deliberate, informational items flagged for visibility, matching this repo's established convention for documenting a scope/design deviation from an originating doc:

1. **The shared error mapper is a name-keyed registry over existing plain-`Error` subclasses, not a retrofit of every BC's ~60 error classes onto a new `DomainError extends Error { code, httpStatus, details }` base**, despite `docs/context/api-conventions.md`'s original code sketch showing the latter. Retrofitting would touch every `domain/*.ts` file across `identity-access`/`governance`/`prompt-registry` (and every existing test asserting `.rejects.toThrow(SpecificErrorClass)`, which still works either way since the classes keep their identity) for a purely mechanical, non-functional change — FR-012/013/014's actual observable contract (same shape/status per failure class, field-level validation detail, no leaked internals) is fully satisfied by a registry keyed on `error.constructor`/`instanceof` living entirely in `src/shared/api/errors.ts`, with zero BC files touched. `research.md` §1 documents the full comparison; `data-model.md` documents the registry's complete class→code→status table.
2. **A request-body/query validation failure (Zod) and a thrown BC domain validation error (e.g. `InvalidPolicyScopeError`) both map to HTTP 422 through the same mapper, but via two different code paths** — Zod errors are caught by the shared `withApiRoute` wrapper before a BC is ever called (malformed input never reaches the BC layer at all) and get a `VALIDATION_FAILED` code with a `details.fieldErrors` shape from Zod's own `.flatten()`; BC-thrown validation errors get their own specific code (e.g. `INVALID_POLICY_SCOPE`) per the registry. Both satisfy FR-013's "identifies which field(s) failed, consistently structured" — documented explicitly since it's two mechanisms converging on one HTTP status, not one.
