---

description: "Task list for 027-rest-api-core-routes"

---

# Tasks: REST API Core Routes

**Input**: Design documents from `/specs/027-rest-api-core-routes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — constitution Principle I (Test-First) is mandatory in this repo; every route ships a Testcontainers-backed integration test alongside it (happy path + auth-denial + cross-org + validation), per plan.md's Testing section.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (P1, core CRUD), US2 (P2, expand + chain runs), US3 (P3, consistent errors — verification only, no new production code)

## Path Conventions

Single Next.js project. Shared cross-cutting modules: `src/shared/api/`. Route handlers: `src/app/api/**/route.ts` with a sibling `route.test.ts`.

---

## Phase 1: Setup

- [ ] T001 Add `zod` as a dependency (`pnpm add zod`) — used for request body/query validation per research.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The auth resolver and error mapper every route depends on. No route handler can be written until this phase is complete.

- [ ] T002 [P] Create `src/shared/api/errors.ts` — `mapError(err: unknown)` with the full class→code→status registry from `data-model.md` (Identity & Access, Governance, Prompt Registry sections), plus `ZodError` → 422 `VALIDATION_FAILED` (with `details.fieldErrors`) and unhandled → 500 `INTERNAL_ERROR` fallback (never leaks `err.stack`/`err.message` to the response body); also export `notFoundResponse(code, message?)` for the `null`-return and bare-`Error` "not found" cases documented in `data-model.md`
- [ ] T003 [P] Create `src/shared/api/errors.test.ts` — unit test exercising every registry entry (instantiate each error class, assert exact `{status, code}`) plus the `ZodError`, `notFoundResponse`, and unhandled-error fallback paths; no DB needed
- [ ] T004 [P] Create `src/shared/api/pagination.ts` — `parsePageParams(url, defaults)` per research.md's pagination decision (page/pageSize, pageSize capped at 100, invalid input throws a `ZodError`-shaped failure)
- [ ] T005 Create `src/shared/api/auth.ts` — `resolveCaller(request)` dual-mode resolution (`Authorization: Bearer` via `authenticateApiKey(authDb, ...)`, else session cookie via `authenticateSession(authDb, ...)`, both from `@/bcs/identity-access`), returning `ResolvedCaller | null`; `apiAuditContext(request)` returning `{ transport: "api", sourceIp }` per research.md
- [ ] T006 Create `src/shared/api/handler.ts` — `withApiRoute(fn)` wrapper: awaits Next 16 `params`, calls `resolveCaller`, 401s on `null` (`UNAUTHENTICATED`), invokes `fn`, catches thrown errors through `mapError`, logs via `getLogger("distribution")` (request completion + error `code`/`err` fields per `docs/context/api-conventions.md`'s logging schema)
- [ ] T007 Create `src/shared/api/test-helpers.ts` — `buildSessionCookieRequest(url, opts, { userId })` (signs a real JWT via identity-access's `infrastructure/jwt.ts` helpers) and `buildApiKeyRequest(url, opts, { rawKey })`, for use by every `route.test.ts`

**Checkpoint**: Foundation ready — every user story's route handlers can now be built in parallel.

---

## Phase 3: User Story 1 - Manage core resources through the API (Priority: P1) 🎯 MVP

**Goal**: Full CRUD (or the resource's equivalent subset) for teams, users, API keys, projects (+members/collaborator teams/repos/skill-assignments), skills (+versions/rollback/subscriptions/fork), policies, and objectives, through the API alone.

**Independent Test**: For each resource, create → read → list alongside a sibling → update → delete (where applicable) through the API alone; results match the equivalent BC function's behavior. Per `contracts/error-shape.contract.md` and `contracts/teams-users-apikeys.contract.md`/`projects.contract.md`/`skills.contract.md`/`policies-objectives.contract.md`.

### Teams, Users, API Keys (identity-access) — see `contracts/teams-users-apikeys.contract.md`

- [ ] T008 [P] [US1] `src/app/api/teams/route.ts` + `route.test.ts` — POST (`createTeam`, admin-only) / GET (`listTeams`, query `parentTeamId?`, paginated via `parsePageParams`, FR-015)
- [ ] T009 [P] [US1] `src/app/api/teams/[teamId]/route.ts` + `route.test.ts` — GET (`getTeam`) / PUT (`updateTeam`); no DELETE (no BC function exists — assert `DELETE` is either absent or `405`, do not invent a delete). Both `getTeam` and `updateTeam` throw a bare untyped `Error` for "not found" (no registered domain class) — catch and convert to `notFoundResponse("TEAM_NOT_FOUND")` per research.md's three-shapes decision; check for `NotAuthorizedError`/`DuplicateTeamSlugError` first before treating an error as the bare not-found case
- [ ] T010 [P] [US1] `src/app/api/teams/[teamId]/insert-parent/route.ts` + `route.test.ts` — POST (`insertTeamBetween`, admin-only); same bare-`Error`-catch handling as T009 for the `childTeamId` not-found case
- [ ] T011 [P] [US1] `src/app/api/teams/[teamId]/reparent/route.ts` + `route.test.ts` — POST (`reparentTeam`, admin-only, body `{newParentTeamId}`) — `updateTeam` explicitly excludes hierarchy changes (its own doc comment), so this is a separate route, not folded into T009's PUT; same bare-`Error`-catch handling for both `teamId` and `newParentTeamId` not-found cases (check `CrossOrgReparentError`/`CycleError`/`NotAuthorizedError` first)
- [ ] T012 [P] [US1] `src/app/api/users/route.ts` + `route.test.ts` — POST (`createUser`, admin-only) / GET (`listUsers`, query `teamId?`, paginated via `parsePageParams`, FR-015)
- [ ] T013 [P] [US1] `src/app/api/users/[userId]/route.ts` + `route.test.ts` — GET (`getUser`) / PUT (`updateUser`) / DELETE (`deactivateUser`, admin-only). `getUser` throws a bare untyped `Error` for "not found" (catch → `notFoundResponse("USER_NOT_FOUND")`, per research.md); `updateUser`/`deactivateUser` correctly throw the registered `CrossOrgUserAccessError` for the same situation — flows through `mapError` normally, no special-casing needed for PUT/DELETE
- [ ] T014 [P] [US1] `src/app/api/users/[userId]/api-keys/route.ts` + `route.test.ts` — POST (`createApiKey`, self-or-admin, one-time `rawKey` in response) / GET (`listApiKeys`, self-or-admin)
- [ ] T015 [P] [US1] `src/app/api/api-keys/[keyId]/route.ts` + `route.test.ts` — DELETE (`revokeApiKey`, self-or-admin)

### Projects (prompt-registry) — see `contracts/projects.contract.md`

- [ ] T016 [P] [US1] `src/app/api/projects/route.ts` + `route.test.ts` — POST (`createProject`) / GET (`listProjectsByOrganization` or `listProjectsByTeam` if `?teamId=`, paginated via `parsePageParams`, FR-015)
- [ ] T017 [P] [US1] `src/app/api/projects/[projectId]/route.ts` + `route.test.ts` — GET (`getProject`) / PUT (`updateProject`) / DELETE (`deleteProject`)
- [ ] T018 [P] [US1] `src/app/api/projects/[projectId]/members/route.ts` + `route.test.ts` — POST (`addProjectMember`) / GET (`listProjectMembers`)
- [ ] T019 [P] [US1] `src/app/api/projects/[projectId]/members/[userId]/route.ts` + `route.test.ts` — DELETE (`removeProjectMember`)
- [ ] T020 [P] [US1] `src/app/api/projects/[projectId]/teams/route.ts` + `route.test.ts` — POST (`addCollaboratorTeam`) / GET (`listProjectTeams`)
- [ ] T021 [P] [US1] `src/app/api/projects/[projectId]/teams/[teamId]/route.ts` + `route.test.ts` — DELETE (`removeCollaboratorTeam`)
- [ ] T022 [P] [US1] `src/app/api/projects/[projectId]/repos/route.ts` + `route.test.ts` — POST (`addProjectRepo`) / GET (`listProjectRepos`)
- [ ] T023 [P] [US1] `src/app/api/projects/[projectId]/repos/[repoId]/route.ts` + `route.test.ts` — DELETE (`removeProjectRepo`)
- [ ] T024 [P] [US1] `src/app/api/projects/[projectId]/skills/route.ts` + `route.test.ts` — POST (`assignSkillToProject`, body `{skillId, requirement}`) / GET (`listProjectSkillAssignmentsForOrganization`, filtered to `projectId`)
- [ ] T025 [P] [US1] `src/app/api/projects/[projectId]/skills/[skillId]/route.ts` + `route.test.ts` — DELETE (`unassignSkillFromProject`)
- [ ] T026 [P] [US1] `src/app/api/projects/[projectId]/objectives/route.ts` + `route.test.ts` — POST (`createObjective` from `@/bcs/governance`, `projectId` set) / GET (`listProjectObjectives`)
- [ ] T027 [P] [US1] `src/app/api/projects/[projectId]/metrics/route.ts` + `route.test.ts` — GET (`getProjectMetrics`)

### Skills / Versions / Sharing (prompt-registry, CRUD subset only — expand/chain-runs are US2) — see `contracts/skills.contract.md`

- [ ] T028 [P] [US1] `src/app/api/skills/route.ts` + `route.test.ts` — POST (`createPrompt`) / GET (`listPrompts`, query `projectId?`, paginated via `parsePageParams`, FR-015)
- [ ] T029 [P] [US1] `src/app/api/skills/[name]/route.ts` + `route.test.ts` — GET (`getPrompt`) / DELETE (`deprecatePrompt`)
- [ ] T030 [P] [US1] `src/app/api/skills/[name]/versions/route.ts` + `route.test.ts` — POST (`publishVersion`, resolve `promptId` from `name` first) / GET (`listVersions`)
- [ ] T031 [P] [US1] `src/app/api/skills/[name]/rollback/route.ts` + `route.test.ts` — POST (`rollbackPrompt`, body `{version}`)
- [ ] T032 [P] [US1] `src/app/api/skills/[name]/subscriptions/route.ts` + `route.test.ts` — POST (`subscribeSkill`) / GET (`listSubscriptionsForSkill`)
- [ ] T033 [P] [US1] `src/app/api/skills/[name]/subscriptions/[subscriptionId]/route.ts` + `route.test.ts` — DELETE (`unsubscribeSkill`)
- [ ] T034 [P] [US1] `src/app/api/skills/[name]/fork/route.ts` + `route.test.ts` — POST (`forkSkill`, body `{ownerType, ownerId}`)

### Policies / Objectives (governance) — see `contracts/policies-objectives.contract.md`

- [ ] T035 [P] [US1] `src/app/api/policies/route.ts` + `route.test.ts` — POST (`createPolicy`) / GET (`listTeamPolicies`, `?teamId=` required, 422 if missing)
- [ ] T036 [P] [US1] `src/app/api/policies/effective/route.ts` + `route.test.ts` — GET (`resolveEffectivePolicies`, `?userId=` defaults to caller)
- [ ] T037 [P] [US1] `src/app/api/policies/[policyId]/route.ts` + `route.test.ts` — GET (`getPolicy`) / PUT (`updatePolicy`) / DELETE (`deletePolicy`)
- [ ] T038 [P] [US1] `src/app/api/objectives/route.ts` + `route.test.ts` — POST (`createObjective`) / GET (dispatch to `listTeamObjectives`/`listUserObjectives`/`listProjectObjectives` by exactly one of `teamId`/`userId`/`projectId`, else 422)
- [ ] T039 [P] [US1] `src/app/api/objectives/effective/route.ts` + `route.test.ts` — GET (`resolveEffectiveObjectives`, `?userId=` defaults to caller, `?projectId=` optional)
- [ ] T040 [P] [US1] `src/app/api/objectives/[objectiveId]/route.ts` + `route.test.ts` — GET (`getObjective`) / PUT (`updateObjective`) / DELETE (`deleteObjective`)

**Checkpoint**: User Story 1 fully functional and independently testable — every core resource has a working CRUD (or equivalent) REST surface.

---

## Phase 4: User Story 2 - Invoke a skill and run a multi-step chain through the API (Priority: P2)

**Goal**: Resolve a skill's governed content (expand) and drive a multi-step chain run to completion, entirely through the API.

**Independent Test**: Publish a skill (template or chain) via US1's routes, then expand it or start/advance a chain run through the API alone; content reflects the caller's governance context; a chain run reaches a finished state after every step is reported. Per `contracts/skills.contract.md`.

- [ ] T041 [US2] `src/app/api/skills/[name]/expand/route.ts` + `route.test.ts` — POST (`expand`, body `{input, version?, projectId?}`) — depends on T029 existing (uses same `[name]` segment convention, no shared code dependency)
- [ ] T042 [US2] `src/app/api/skills/[name]/chain-runs/route.ts` + `route.test.ts` — POST (`startSkillChainRun`) / GET (`listSkillChainRuns`)
- [ ] T043 [P] [US2] `src/app/api/chain-runs/[runId]/route.ts` + `route.test.ts` — GET (`getSkillChainRun`)
- [ ] T044 [P] [US2] `src/app/api/chain-runs/[runId]/advance/route.ts` + `route.test.ts` — POST (`advanceSkillChainRun`, body `{stepIndex, status, output?, error?}`)
- [ ] T045 [P] [US2] `src/app/api/chain-runs/[runId]/abandon/route.ts` + `route.test.ts` — POST (`abandonSkillChainRun`)

**Checkpoint**: User Story 2 fully functional — a caller can expand a skill and drive a chain run end-to-end via the API alone (SC-004).

---

## Phase 5: User Story 3 - Get a predictable, consistent error for any failure (Priority: P3)

**Goal**: Confirm the same class of failure produces an identical response shape/status across unrelated resources — this story adds no new production code (the error mapper was built in Phase 2 and every US1/US2 route already routes through it); it adds the cross-resource verification the spec calls for.

**Independent Test**: Trigger "not found," "unauthorized," and "validation" against two different, unrelated resource endpoints; response body shape, code convention, and status are identical.

- [ ] T046 [US3] `src/shared/api/cross-resource-error-shape.test.ts` — integration test: trigger a not-found against `/api/teams/{bogus-id}` and `/api/policies/{bogus-id}`, assert identical envelope shape/status convention (different `code` values, same structure); trigger a validation failure against two different resources' POST bodies, assert both carry `details.fieldErrors`; trigger an authorization denial (non-admin calling an admin-only route) and a cross-org id (a real id from a second, differently-seeded org) against two different resources, assert both cross-org cases return the same status/shape as their resource's own not-found case (SC-003)

**Checkpoint**: All three user stories complete and independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T047 Run `pnpm lint` — confirm zero `boundaries/dependencies` violations across every new `src/app/api/**` file (SC-005; the existing `app`-element policy already covers this, per research.md — this task is verification, not new config). Also `grep -rn "authDb" src/app/api` and confirm zero matches (FR-016: only `src/shared/api/auth.ts` may import `authDb`)
- [ ] T048 Run `pnpm typecheck`
- [ ] T049 Run full `pnpm test` (Testcontainers-backed) — confirm no regressions in any existing BC test
- [ ] T050 Update `backlog/008-distribution/001-rest-api-core-routes.md` — check off each satisfied Requirement/Acceptance Criteria bullet; leave `status: open` and do not archive if any bullet isn't actually true (e.g. team deletion has no route, since no BC function exists) — document the team-deletion gap and the reparent-route addition explicitly in the item's own notes rather than silently checking things off
- [ ] T051 Run `as-finish` pipeline and address any findings

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: T002-T007 must all complete before any route file is written (every route imports `withApiRoute`/`mapError`/`resolveCaller`).
- **Phase 2 → Phase 3 (US1)**: All T008-T040 tasks are mutually parallelizable (`[P]`) once Phase 2 is done — each touches a disjoint route file plus its own test file.
- **Phase 3 → Phase 4 (US2)**: T041/T042 touch the `skills/[name]/` directory alongside US1's T029-T034 but are themselves new, disjoint files — can start as soon as Phase 2 is done in practice, sequenced after US1 here only to match spec.md's stated priority order (US1 is the floor US2 depends on functionally: a chain run needs a published chain skill, which needs T028/T030 done first to be testable end-to-end).
- **Phase 4 → Phase 5 (US3)**: T046 needs at least two US1 resources and one validation-carrying US1/US2 route to exist.
- **Phase 5 → Phase 6 (Polish)**: Final verification after all routes exist.

## Parallel Execution Example (Phase 3)

Once Phase 2 (T002-T007) is committed, T008 through T040 (33 tasks) can each be assigned independently — no two touch the same file, and none depends on another's completion. A practical grouping for parallel agent delegation: one agent per contract file (`teams-users-apikeys` → T008-T015, `projects` → T016-T027, `skills` CRUD → T028-T034, `policies-objectives` → T035-T040), each working only within its own `src/app/api/<group>/**` subtree.

## Implementation Strategy

**MVP = User Story 1** (T001-T040): every core resource manageable through the API is the floor the rest of the product (web UI, CLI, skill invocation) stands on, per spec.md's own "Why this priority." User Story 2 (expand + chain runs) and User Story 3 (cross-resource error verification) are additive on top of a working US1.
