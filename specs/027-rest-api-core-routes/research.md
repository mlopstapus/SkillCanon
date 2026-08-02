# Research: REST API Core Routes

No `[NEEDS CLARIFICATION]` markers remained in spec.md after `/speckit-clarify` (both real ambiguities — chain-run synchronous convenience endpoint, and API-key auth scope — were answered "Option A" for both). This document captures the concrete engineering decisions needed to turn the spec/CONTRACT.md/api-conventions.md into a buildable route-handler design.

## Decision: error mapping via a name-keyed registry, not a `DomainError` base-class retrofit

**Decision**: `src/shared/api/errors.ts` exports `mapError(err: unknown): { status: number; body: { error: { code: string; message: string; details?: Record<string, unknown> } } }`. Internally it holds a `Map<Function, { code: string; status: number }>` populated with every existing error class exported by `identity-access`/`governance`/`prompt-registry`/`audit-compliance`'s barrels (confirmed via `grep -rn "class.*Error" src/bcs/*/domain/*.ts`: ~60 classes, all `extends Error` today — no `DomainError` base exists anywhere in code, despite `docs/context/api-conventions.md`'s illustrative sketch). `mapError` walks the registry with `instanceof`, falls back to a `ZodError` check (422, field errors from `.flatten()`), then falls back to an unhandled-error 500 (generic message, full error only to `shared/logging`).

**Rationale**: The observable contract FR-012/013/014 requires is "same shape/status per class of failure, field detail on validation, no leaked internals on 500" — a registry keyed on class identity satisfies this exactly, without editing a single existing `domain/*.ts` file across three bounded contexts (and without touching any existing test that does `.rejects.toThrow(SpecificErrorClass)`, since the classes' identity/inheritance from `Error` is unchanged). This is a pure-addition change confined to `src/shared/api/`, matching this repo's own established bias toward minimal-blast-radius changes (see CLAUDE.md's `brace-expansion` override note, and the `022`/`023` "verify a signature change's real callers before it touches something else" pattern).

**Alternatives considered**: Retrofitting every class to `extends DomainError` (adding `code`/`httpStatus`/`details` fields per api-conventions.md's sketch) — rejected: touches ~60 files across 3 BCs for a mechanical rename with zero new observable behavior, and risks a name/status typo landing far from where it's reviewed (buried in a domain file instead of one central table). If a future feature needs `code` to be introspectable *from the error itself* (e.g. an MCP tool handler that isn't a REST route), the registry can be inverted into a `WeakMap`-based decorator applied at class-definition time without changing this feature's routes.

## Decision: dual-mode auth resolution — `src/shared/api/auth.ts`

**Decision**:

```ts
export interface ResolvedCaller {
  actingUser: UserSummary; // identity-access's UserSummary; AppSessionUser is a superset
  organizationId: string;
  auditContext: AuditContext; // { transport: "api", sourceIp }
}

export async function resolveCaller(request: Request): Promise<ResolvedCaller | null> {
  const authHeader = request.headers.get("authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const result = await authenticateApiKey(authDb, bearerMatch[1]);
    if (!result) return null;
    return { actingUser: result.user, organizationId: result.user.orgId, auditContext: apiAuditContext(request) };
  }
  const user = await authenticateSession(authDb, request.headers.get("cookie"));
  if (!user) return null;
  return { actingUser: user, organizationId: user.orgId, auditContext: apiAuditContext(request) };
}
```

Every route handler's first line (via the shared `withApiRoute` wrapper, see below) is `resolveCaller(request)`; a `null` result short-circuits to `401 { error: { code: "UNAUTHENTICATED", message: "..." } }` before any BC function runs (FR-010). `Bearer` is checked before the cookie so an API-key caller (e.g. the future Skill Sync CLI) never accidentally falls back to a stray browser cookie in the same request.

**Rationale**: Both `authenticateApiKey` and `authenticateSession` already implement "never throw, resolve null for anything wrong" and already require `authDb` (FR-016) — `resolveCaller` is a thin, uniform composition of exactly those two existing functions, matching `(app)/prompts/[name]/page.tsx`'s own already-established `authenticateSession(authDb, cookieHeader)` → `withTenantContext(db, user.orgId, ...)` pattern, extended with the bearer-token branch. No new session/token logic is introduced.

**Alternatives considered**: A route-level `requireAdmin`-style dependency-injection wrapper mirroring FastAPI's `Depends` — rejected as unnecessary abstraction; every BC application function already re-checks its own role/ownership requirement internally (e.g. `createTeam` throws `NotAuthorizedError` for a non-admin `actingUser`), so the route layer only needs to resolve *who* is calling, not *what* they're allowed to do.

## Decision: `withApiRoute` wrapper — one place for auth + error mapping + logging

**Decision**: `src/shared/api/handler.ts` exports `withApiRoute<T>(fn: (request: Request, ctx: { caller: ResolvedCaller; params: T }) => Promise<Response>)`, returning a Next.js route-handler-compatible function `(request, { params }) => Promise<Response>`. It: resolves `params` (awaiting the Next 16 `Promise<...>` shape), calls `resolveCaller`, 401s on `null`, otherwise invokes `fn` inside a `try/catch` that routes any thrown error through `mapError` and logs it via `getLogger("distribution")` (`code`/`err` fields per api-conventions.md's logging schema), and always logs one completion line with `durationMs`.

**Rationale**: Every route needs the exact same three steps (auth, error-to-response, structured log) — writing them once here means a route handler's own body is just "parse input → call one BC function → shape response," matching the spec's own framing of this feature as "mostly wiring." This is the Distribution-layer equivalent of the `withAudit`/`withTenantContext` composition pattern this codebase already uses elsewhere (compose small, single-purpose wrappers rather than duplicating boilerplate per call site).

**Alternatives considered**: Next.js middleware (`middleware.ts`) doing auth resolution repo-wide — rejected: middleware runs on the Edge runtime by default in this Next version and cannot easily call `authenticateSession`/`authenticateApiKey` (both do real Postgres queries via `authDb`, which needs the Node runtime); a per-route wrapper keeps everything on the Node runtime with no extra config.

## Decision: tenant-context wrapping stays route-local, not inside `withApiRoute`

**Decision**: `withApiRoute` resolves `caller` but does **not** itself call `withTenantContext` — each route body calls `withTenantContext(db, caller.organizationId, async (tx) => { ... })` explicitly around its own BC call(s).

**Rationale**: Matches the codebase-wide, already-documented convention (CLAUDE.md: "no application function anywhere in this codebase calls `withTenantContext` internally... only ever called from a route handler, MCP handler, or a test, wrapping the *entire* call chain") — `src/app/api/**/route.ts` files *are* that composition root. Some routes need more than one BC call inside the same tenant-scoped transaction (e.g. `POST /api/projects/{id}/skills` calls `assignSkillToProject`, which itself is the single call — but `GET /api/skills` calling `listPrompts` plus resolving `projectId` context is a single-call case too); keeping the wrap at the route level (not baked into `withApiRoute`) leaves each route free to call one or several BC functions inside one transaction as needed, without a generic wrapper guessing at that shape.

## Decision: pagination — shared `parsePageParams`, offset-based

**Decision**: `src/shared/api/pagination.ts` exports `parsePageParams(url: URL, defaults = { page: 1, pageSize: 20 }): { page: number; pageSize: number }`, validating both are positive integers (`pageSize` capped at 100) and throwing a `ZodError`-shaped validation failure (via a tiny inline Zod schema) on anything else, so it flows through the same 422 path as any other input-validation failure. Applied to `GET /api/skills`, `GET /api/teams`, `GET /api/projects`, `GET /api/users` (FR-015's "collections that can grow without bound").

**Rationale**: `docs/context/api-conventions.md` already decided page/page_size (offset-based) at the platform level; this is the one shared helper needed to apply it consistently across the four unbounded collections FR-015 names, rather than four slightly different ad hoc query-parsing blocks. `listPrompts`/`listTeams`/etc. themselves return full arrays today (no BC-level pagination exists yet) — this feature's routes apply the page/pageSize slice in the route handler after the BC call returns, since adding real DB-level `LIMIT`/`OFFSET` to every listed BC function is out of this feature's scope (a straight port plus error-shape consistency, per the spec's own framing) and each of these BCs' lists are per-organization, not global, so an in-memory slice of an already tenant-scoped result set is the pragmatic choice matching current data volumes (no BC in this codebase serves more than a few hundred rows per org today).

**Alternatives considered**: Pushing real `LIMIT`/`OFFSET` into each BC's list function — rejected as scope creep for this feature (would require touching `identity-access`/`prompt-registry` infrastructure/application files, violating the "zero BC file changes" structure decision) and not required by any FR; FR-015 only requires that the *response* supports paging, not that every BC query does yet. Flagged as a natural follow-up for whichever future feature first needs it at real scale.

## Decision: request validation — Zod schemas colocated per route

**Decision**: Each route file defines its own small Zod schema(s) for its request body/query, parsed via `.parse()` (throwing `ZodError` on failure, caught by `withApiRoute`). No shared cross-resource schema module — each resource's shape is already defined by its BC's own `Insert*Params`/`Update*` TypeScript types, and Zod schemas here exist only to validate *untrusted wire input* before it reaches those typed BC calls, not to duplicate BC-level business validation (e.g. Zod checks "`name` is a non-empty string"; `createTeam` itself still checks slug uniqueness).

**Rationale**: Keeps each route's input contract next to the route that owns it (same locality principle as the rest of this codebase's one-file-per-concern convention), and Zod is the natural fit for FR-013's "identify which field(s) failed, consistently structured" via `.safeParse().error.flatten()`.

## Decision: module-boundary lint coverage for `src/app/api/**` — already enforced, no config change

**Decision**: No `eslint.config.mjs` change. `boundaries/elements`' existing `{ type: "app", pattern: "src/app" }` entry (no trailing `**`, per the already-documented v7 `partialMatch` gotcha in CLAUDE.md) already covers the entire `src/app` subtree as one element, and the existing `boundaries/dependencies` policy already disallows *any* element — `app` included — from importing a `bc` element's non-`index.ts` path. Verified directly: a probe file at `src/app/api/__boundary_probe__/route.ts` importing `@/bcs/identity-access/infrastructure/api-keys-repo` (bypassing the barrel) fails `pnpm lint` today with exactly the expected `boundaries/dependencies` error, before any route from this feature exists.

**Rationale**: FR-017/SC-005 ("no route handler imports another BC's internal schema/model files directly") is already mechanically guaranteed by the rule this repo built in `003-module-boundary-lint-enforcement` — this feature just needs to not violate it, not add new lint config. Documented here (rather than silently assumed) so `/speckit-analyze` and the implementer don't waste a task slot re-deriving or re-adding a rule that already exists.

## Decision: audit-context threading uses the existing `"api"` transport value

**Decision**: `apiAuditContext(request): AuditContext` returns `{ transport: "api", sourceIp: request.headers.get("x-forwarded-for") ?? null }`, passed as the `auditContext` option to every mutating BC call a route makes (every BC mutation function already accepts an optional `auditContext`, defaulting to `DEFAULT_WEB_AUDIT_CONTEXT` if omitted).

**Rationale**: `AuditContext`'s `AuditTransport` union already includes `"api"` (`src/bcs/audit-compliance/domain/audit-event.ts`) — added in anticipation of exactly this feature, never previously used since no REST route existed yet. No new audit schema/value needed.

## Decision: `GET /api/policies` and `GET /api/objectives` list semantics

**Decision**: Governance's exposed reads are scope-specific (`listTeamPolicies(orgId, teamId)`, `listTeamObjectives`/`listUserObjectives`/`listProjectObjectives` — no single "list all" function exists). `GET /api/policies` requires exactly one of `?teamId=` (calls `listTeamPolicies`); `GET /api/objectives` requires exactly one of `?teamId=` / `?userId=` / `?projectId=` (dispatches to the matching `list*Objectives` call) — a request with zero or more than one of these query params is a 422 validation failure.

**Rationale**: Mirrors the shape the BC contract actually exposes (constitution D1: routes call only what's already exposed, no new BC-level "list everything" function invented for this feature) while still satisfying FR-005's "read... policies and objectives" — a caller always has a scope in mind (a team's local rules, a project's objectives) since governance data is inherently scoped, never a flat organization-wide list in the underlying domain model.

## Decision: skill-chain routes split between `/api/skills/{name}/chain-runs` and `/api/chain-runs/{runId}`

**Decision**: Starting a run and listing a skill's runs stay nested under the skill (`POST|GET /api/skills/{name}/chain-runs`, since `startSkillChainRun(db, actor, promptName, version?)` and `listSkillChainRuns(orgId, promptId)` both take a prompt reference). Advancing, abandoning, and reading one run's state move to a top-level `/api/chain-runs/{runId}/*` (since `advanceSkillChainRun`/`abandonSkillChainRun`/`getSkillChainRun` all key purely off `runId`, with no `promptName` parameter at all).

**Rationale**: Route shape follows each function's actual parameter list exactly (constitution III: no new business rules invented at the route layer, including implicit ones like "a run is always addressed through its skill") — inventing a `/api/skills/{name}/chain-runs/{runId}/advance` nesting would require the route handler to silently ignore `name` (never checked, since `advanceSkillChainRun` has no way to cross-check it) or add a redundant lookup no BC function needs, either of which misrepresents what the underlying call actually validates.

## Decision: no synchronous chain "run to completion" endpoint (confirmed, 2026-08-02 clarification)

**Decision**: No `POST /api/skills/{name}/chain-runs/run` or similar convenience endpoint. `startSkillChainRun`/`advanceSkillChainRun`/`abandonSkillChainRun`/`listSkillChainRuns`/`getSkillChainRun` are exposed 1:1, nothing more.

**Rationale**: Directly the "Option A" answer already recorded in spec.md's Clarifications and FR-009.

## Decision: route-handler integration testing without an HTTP server

**Decision**: Every `route.test.ts` imports its sibling `route.ts`'s exported `GET`/`POST`/`PUT`/`DELETE` functions directly and invokes them with a hand-constructed `Request` (via `new Request(url, { method, headers, body })`) and a `{ params: Promise.resolve({...}) }` second argument — no `next dev`/real HTTP listener. Auth is set up via `src/shared/api/test-helpers.ts`'s `buildSessionCookieRequest`/`buildApiKeyRequest`, which sign a real session JWT via `identity-access`'s own `infrastructure/jwt.ts` helpers (already used by `authenticateSession`) or create a real API key row via `createApiKey`, so the auth path under test is the real one, not a mock.

**Rationale**: Matches this repo's existing "no `next dev` in tests" posture (Testcontainers Vitest suite spins up Postgres, never a real Next.js server) and Next.js App Router route handlers are just exported async functions — directly callable, no framework needed to exercise them. Reusing the real JWT-signing/API-key-creation path (rather than mocking `authenticateSession`/`authenticateApiKey`) means these tests exercise the exact dual-mode auth resolution FR-010 requires, not a stand-in for it.
