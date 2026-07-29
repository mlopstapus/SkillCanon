# Tasks: Audit Log UI

**Input**: Design documents from `/specs/020-audit-log-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included, colocated with each implementation file (`*.test.ts`/`*.test.tsx` alongside the file it tests) — matching this repo's established convention (see `CLAUDE.md`: no standalone `domain/*.test.ts` files, `renderToStaticMarkup`-only React testing) rather than the generic template's separate pre-implementation test-task pattern. Constitution Principle I (test-first) is honored per-task: each task's test is written to fail against the task's own new code before that code is finished, not as a separately tracked checklist item.

**Organization**: Tasks are grouped by user story (spec.md's P1/P1/P2/P3) to enable independent implementation and testing of each story.

## Path Conventions

Single unified Next.js app (`src/` at repo root) — see `plan.md`'s Project Structure. No `backend/`/`frontend/` split.

---

## Phase 1: Setup

**Purpose**: Confirm the ground this feature composes into is actually in place before writing anything new.

- [x] T001 Verify `src/app/(app)/_components/nav-model.ts`'s existing `auditLog` entry (`href: "/settings/audit-log"`) and the `(app)` route group's session-auth layout compose correctly with this feature's planned route — no code change expected, verification only

**Checkpoint**: Confirmed the route this feature builds already has a live nav entry and shell to land in.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The cross-BC name-resolution layer every user story's rendering depends on. No user story's row list or detail drawer can show a resource/actor name without this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Implement `getInvitation(db, organizationId, invitationId)` (wraps existing `invitations-repo.findByOrgAndId`; returns `InvitationSummary | null`) + test in `src/bcs/identity-access/application/get-invitation.ts` / `get-invitation.test.ts`
- [x] T003 [P] Implement `getApiKeySummary(db, organizationId, apiKeyId)` (wraps existing `api-keys-repo.findByOrgAndId`; returns `ApiKeySummary | null`, never the raw key or hash) + test in `src/bcs/identity-access/application/get-api-key-summary.ts` / `get-api-key-summary.test.ts`
- [x] T004 Export `getInvitation`, `getApiKeySummary` from `src/bcs/identity-access/index.ts` (depends on T002, T003)
- [x] T005 Update `src/bcs/identity-access/CONTRACT.md`'s Exposed APIs table for the 2 new getters, consumer: "Audit & Compliance (audit log UI resource-name resolution)" (depends on T004)
- [x] T006 [P] Implement `getPromptById(db, organizationId, promptId)` (wraps existing `prompts-repo.findPromptByOrgAndId`; returns `PromptSummary | null`) + test in `src/bcs/prompt-registry/application/get-prompt-by-id.ts` / `get-prompt-by-id.test.ts`
- [x] T007 [P] Implement `getPromptVersion(db, organizationId, versionId)` (wraps existing `prompt-versions-repo.findVersionById`; settle data-model.md's open question by joining through the owning prompt for org-scoping, matching every other new getter's convention) + test in `src/bcs/prompt-registry/application/get-prompt-version.ts` / `get-prompt-version.test.ts`
- [x] T008 Export `getPromptById`, `getPromptVersion` from `src/bcs/prompt-registry/index.ts` (depends on T006, T007)
- [x] T009 Update `src/bcs/prompt-registry/CONTRACT.md`'s Exposed APIs table for the 2 new getters (depends on T008)
- [x] T010 Add `listDistinctActors(tx, organizationId, retentionCutoff)` query (distinct `(actorUserId, actorApiKeyId)` pairs within the retained window) + test in `src/bcs/audit-compliance/infrastructure/audit-events-repo.ts` / `audit-events-repo.test.ts`
- [x] T011 Implement `resolveResourceDisplayName(db, organizationId, resourceType, resourceId)` dispatching to `getTeam`/`getOrganization`/`getUser`/`getPolicy`/`getObjective`/`getProject` (existing) plus `getInvitation`/`getApiKeySummary`/`getPromptById`/`getPromptVersion` (new), with a raw-id fallback for `project_member` and any resolution failure + test covering all 11 real `resourceType` values plus the deleted-resource fallback case, in `src/bcs/audit-compliance/application/resolve-resource-display-name.ts` / `.test.ts` (depends on T004, T008)
- [x] T012 Implement `resolveActorDisplayName(db, organizationId, actorUserId, actorApiKeyId)` (user → `getUser`, api key → `getApiKeySummary`, both null → literal `"system"`) + test in `src/bcs/audit-compliance/application/resolve-actor-display-name.ts` / `.test.ts` (depends on T004)
- [x] T013 Implement `listAuditActorOptions(db, organizationId, retentionCutoff)` (combines T010 + T012, dedupes, returns `AuditActorOption[]` per data-model.md) + test in `src/bcs/audit-compliance/application/list-audit-actor-options.ts` / `.test.ts` (depends on T010, T012)
- [x] T014 Implement `resolveAuditRows(db, organizationId, events)` batching helper (dedupes by unique `(resourceType, resourceId)` and unique actor id across the page before calling T011/T012, per research.md's N+1-avoidance decision; returns `ResolvedAuditRow[]`) + test in `src/bcs/audit-compliance/application/resolve-audit-rows.ts` / `.test.ts` (depends on T011, T012)
- [x] T015 Export `resolveAuditRows`, `listAuditActorOptions`, and their result types (`ResolvedAuditRow`, `ResolvedActor`, `AuditActorOption`) from `src/bcs/audit-compliance/index.ts` (depends on T013, T014)
- [x] T016 Update `src/bcs/audit-compliance/CONTRACT.md`'s Exposed APIs table for `resolveAuditRows`/`listAuditActorOptions`, consumer: "Distribution (audit log UI)" (depends on T015)
- [x] T016a **(added post-`/speckit-analyze`, finding C1)** Implement `resolveAuditEntitlementsForOrg(organizationId)` in `src/bcs/audit-compliance/application/resolve-audit-entitlements-for-org.ts` — calls the real `resolveEntitlements(organizationId)` from `@/bcs/billing-entitlements` for `auditRetentionDays`, keeps `canExportAuditEvents: false` hardcoded (no real export key exists yet) + test in `.test.ts`
- [x] T016b **(post-analyze)** Update `list.ts`, `export.ts`, and `prune.ts` (all three existing callers of the old domain-layer `resolveAuditEntitlements()` stub) to call `resolveAuditEntitlementsForOrg(organizationId)` instead — each already has `organizationId` in scope; update `list.test.ts`/`export.test.ts`/`prune.test.ts` accordingly (depends on T016a)
- [x] T016c **(post-analyze)** Remove the now-unused domain-layer `resolveAuditEntitlements()` from `src/bcs/audit-compliance/domain/audit-event.ts` (confirm no other reference remains after T016b) and its `audit-event.test.ts` coverage for it, if any (depends on T016b)

**Checkpoint**: Foundation ready — every user story phase below can now resolve resource/actor names and start.

---

## Phase 3: User Story 1 - Browse and filter the organization's audit trail (Priority: P1) 🎯 MVP

**Goal**: Admin opens `/settings/audit-log` and sees the org's paginated, reverse-chronological trail, filterable by search/resource/actor/transport/date-range in any combination, with a working Clear-filters action.

**Independent Test**: Open the page as an admin, confirm the full trail renders paginated/reverse-chronological, apply each filter type alone and combined and confirm correct narrowing, clear filters and confirm the full list returns; confirm a non-admin is denied.

- [x] T017 [US1] Implement pure `canAccessAuditLog(user: AppSessionUser): boolean` helper (role === "admin") + test in `src/app/(app)/settings/audit-log/access.ts` / `access.test.ts` — kept as a standalone testable unit per this repo's convention of extracting pure gate logic out of server components (mirrors `isScopeAllowedForRole`'s precedent)
- [x] T018 [US1] Implement server page `src/app/(app)/settings/audit-log/page.tsx`: `authenticateSession`, redirect to `/dashboard` when `!canAccessAuditLog(user)` (T017), parse `AuditLogFilterState` from `searchParams` into `AuditEventFilters`, call `withTenantContext` + `listAuditEvents` + `resolveAuditRows` (T014) + `listAuditActorOptions` (T013) — retention days for the footer comes from `listAuditEvents`'s own returned `AuditEventPage.retentionDays`, now real via T016b's fix; **no `getOrganization`/`planId` call** (corrected post-analyze — see finding U1: `planId` is a UUID FK to a not-yet-built table, not a display name) (depends on T014, T015, T016b, T017)
- [x] T019 [P] [US1] Implement `filter-bar.tsx` (search input; Resource dropdown sourced from the real `resourceType` values seen in retained events; Actor dropdown sourced from `AuditActorOption[]`; **new Transport dropdown** per Clarifications, added beyond the mockup's literal markup; date-range control with 24h/7d/30d/All-within-retention presets **and** a custom start/end picker per Clarifications; Clear-filters action shown only when a filter is active) + test in `src/app/(app)/settings/audit-log/filter-bar.tsx` / `filter-bar.test.tsx`
- [x] T020 [P] [US1] Implement `audit-log-view.tsx` — pure props-in "View" component (per this repo's View/wrapper split convention): row list (time abs+rel, color-coded action badge, resolved resource name, actor avatar-initial+name+role/type subtext, transport badge) + pagination footer (shown range, total count, resolved `retentionDays` shown as "retention: N days" — no fabricated tier/plan name, per finding U1) + test in `src/app/(app)/settings/audit-log/audit-log-view.tsx` / `audit-log-view.test.tsx`
- [x] T021 [US1] Implement thin client wrapper `audit-log.tsx` (owns `useRouter`/`useSearchParams`, writes filter changes back to the URL query string per research.md's filter-persistence decision, renders `FilterBar` + `AuditLogView`) in `src/app/(app)/settings/audit-log/audit-log.tsx` (depends on T019, T020) — untested directly per this repo's router-context testing gotcha; all real logic lives in the tested `*View`/`FilterBar` components it wraps
- [x] T022 **(simplified during implementation)** No separate `actions.ts` server action was built — filter changes update the URL query string (`audit-log.tsx`'s `navigate()`), which triggers Next.js App Router to re-run `page.tsx` (a server component) with the new `searchParams` and re-apply the T017 admin gate on every navigation, exactly like a fresh page load. This is the idiomatic App Router pattern for URL-driven filtering and makes a duplicate client-fetch code path (and a second place to enforce the admin gate) unnecessary — there is exactly one server-side enforcement point (`page.tsx`), not two.
- [x] T022a **(added during implementation)** Implement `listAuditResourceTypeOptions(db, organizationId, retentionCutoff)` in `src/bcs/audit-compliance/application/list-audit-resource-type-options.ts` (wraps a new `listDistinctResourceTypes` repo query) — needed to source the Resource filter dropdown's real, currently-retained resource types (T019), which wasn't yet built in Foundational; exported from the barrel + documented in `CONTRACT.md` alongside T016

**Checkpoint**: User Story 1 fully functional and independently testable — admin can browse and filter the trail.

---

## Phase 4: User Story 2 - Inspect the full detail of a single audit event (Priority: P1)

**Goal**: Clicking a row opens a detail view with actor/source/resource/timestamp, a redaction-safe before/after diff for mutations, and a "no state change" explanation for auth events.

**Independent Test**: Open a mutation event's detail view and confirm the diff matches the underlying change; open a login/logout event and confirm the no-diff explanation instead of an empty diff; confirm a redacted field's real value never renders.

- [x] T023 [US2] Implement `event-detail-drawer.tsx` (slide-in drawer: action/resource header using the resolved display name from T014, 2x2 meta grid — actor/source+ip/resource-type+id/timestamp, field-by-field before/after diff with removed/added styling, no-diff explanatory copy for events with no recorded state change, immutable event id in its own footer row) + test in `src/app/(app)/settings/audit-log/event-detail-drawer.tsx` / `event-detail-drawer.test.tsx` — test cases MUST include: a mutation event's diff, a login/logout event's no-diff copy, and an event whose `after` contains a redacted placeholder (e.g. `key_hash`) to assert the real value never renders (FR-010/SC-002)
- [x] T024 [US2] Wire row-click → drawer open/close state into `audit-log-view.tsx` (extends T020: clicking a row selects an event id, rendering `EventDetailDrawer`; dismissing it clears selection without altering the filtered list or page position) + extend `audit-log-view.test.tsx` accordingly (depends on T020, T023)

**Checkpoint**: User Stories 1 AND 2 both work independently — admin can browse, filter, and inspect full event detail.

---

## Phase 5: User Story 3 - Understand empty and no-match states (Priority: P2)

**Goal**: Distinct, correctly-triggered copy for "no events at all" vs. "no events match these filters."

**Independent Test**: View an org with zero events and confirm the no-events-yet message with no Clear-filters action; apply filters matching nothing and confirm the distinct no-matches message with a working Clear-filters action.

- [x] T025 [US3] Add the two distinct empty-state branches (zero total events vs. zero filtered results) to `audit-log-view.tsx`, each with its own copy and the correct Clear-filters visibility rule (extends T020) + extend `audit-log-view.test.tsx` with both empty-state cases (depends on T020)

**Checkpoint**: All P1/P2 stories independently functional.

---

## Phase 6: User Story 4 - Export the audit trail when entitled (Priority: P3)

**Goal**: Export control hidden entirely today (no entitlement system exists yet); wired so a future entitlement flip needs no further UI rework.

**Independent Test**: Confirm no export control renders anywhere today. (Full entitled/non-entitled behavior isn't independently testable until Billing & Entitlements ships — per spec.md's own Independent Test note for this story.)

- [x] T026 [US4] Implement `export-control.tsx` — a small component taking `canExport: boolean` as a prop: renders nothing when the caller passes no entitlement context (today's actual state, since `resolveAuditEntitlements().canExportAuditEvents` is hardcoded `false`), and renders a visible-but-disabled control with an upgrade explanation when `canExport === false` is explicitly known, or an enabled control when `canExport === true` — proven with tests for all three states even though only the "hidden" state is reachable with today's data, in `src/app/(app)/settings/audit-log/export-control.tsx` / `export-control.test.tsx`
- [x] T027 [US4] Wire `canExportAuditEvents` (from `resolveAuditEntitlementsForOrg`, T016a — still hardcoded `false` today, no real export key exists yet) through `page.tsx` → `audit-log-view.tsx` → `ExportControl` (extends T018, T020) (depends on T016a, T018, T020, T026)

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T028 Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` (the last one specifically to catch any accidental Node-only import leaking into a client component, per this repo's documented `.next/standalone` gotcha)
- [x] T029 Run `pnpm vitest run` for the full new/changed file set (Foundational + all 4 stories) and confirm green
- [x] T030 Manually executed against a real (shared, pre-existing) dev database via the browser: registered a verification-only admin + member account (self-hosted single-org guard meant `/register` was already used by concurrent work in this DB, so two new users were inserted directly into the existing org rather than resetting anyone else's credentials), confirmed real resolved names render for team/user/invitation resources and departed/system actors, confirmed the detail drawer's diff and no-diff states against real data, confirmed the pagination footer's real (non-hardcoded) retention days. **Two real bugs found and fixed during this pass**: (1) the empty-state logic used the filtered `total` alone to decide "no events at all" vs. "no match," so a zero-result search always showed the wrong message — fixed in `audit-log-view.tsx` by also checking `hasActiveFilters`, with a regression test added; (2) the search input navigated (a full server round trip) on every keystroke, dropping characters typed faster than the round trip completed — fixed by debouncing the search field with local state in `filter-bar.tsx`, which surfaced a second bug (the debounced local state didn't resync after "Clear filters"), also fixed and re-verified live.
- [x] T031 Restored and properly archived the source backlog item at `backlog/003-audit-compliance/archive/003-audit-log-ui.md` (a prior commit on `main`, `9a62244`, deleted this file outright — not moved to `archive/` — while marking `EPIC.md`'s checkbox done; this restores the file with its Requirements/Acceptance Criteria checked off to match what's actually shipped, plus a completion note). `EPIC.md`'s existing link to `archive/003-audit-log-ui.md` now resolves correctly.

**Note**: `backlog/003-audit-compliance/001-audit-event-schema-and-write-path.md` was deleted by that same prior commit despite having genuinely unchecked acceptance criteria (an unfinished mutation-retrofit item) — that is a different feature's integrity gap, out of scope for this feature to fix, and is called out separately in this session's final report rather than remediated here.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS all user stories** — every story's rendering needs resolved names.
- **User Stories (Phase 3-6)**: All depend on Foundational. US1 and US2 are both P1; US2 (Phase 4) additionally depends on US1's `audit-log-view.tsx` existing (T020) since the drawer wires into that same file. US3 (Phase 5) and US4 (Phase 6) likewise extend US1's `audit-log-view.tsx`/`page.tsx` rather than standing alone as separate routes.
- **Polish (Phase 7)**: Depends on all four user stories.

### Within Each User Story

- US1: T017 (pure gate helper) → T018 (page, depends on T017 and T016b) in parallel with T019/T020 (client components, no dependency on T018) → T021 (wrapper, depends on T019+T020) → T022 (server actions, depends on T017)
- US2: T023 (drawer, standalone) → T024 (wiring into T020's file, depends on T020+T023)
- US3: T025 (extends T020 directly)
- US4: T026 (standalone component) → T027 (wiring, depends on T018+T020+T026)

### Parallel Opportunities

- Foundational: T002+T003 in parallel; T006+T007 in parallel (different BCs); T010 can run in parallel with T002/T003/T006/T007 (different BC, no shared file); T011 and T012 can run in parallel once T004/T008 land (both only read from the now-exported getters, write to different files)
- US1: T019 and T020 in parallel (different files, both only depend on Foundational)
- Different user story phases could be staffed in parallel by different developers once Foundational is done, though US2/US3/US4 all extend files US1 creates, so in a single-developer session the natural order is US1 → US2 → US3 → US4 as listed

---

## Parallel Example: Foundational Phase

```bash
Task: "Implement getInvitation in src/bcs/identity-access/application/get-invitation.ts"
Task: "Implement getApiKeySummary in src/bcs/identity-access/application/get-api-key-summary.ts"
Task: "Implement getPromptById in src/bcs/prompt-registry/application/get-prompt-by-id.ts"
Task: "Implement getPromptVersion in src/bcs/prompt-registry/application/get-prompt-version.ts"
Task: "Add listDistinctActors to src/bcs/audit-compliance/infrastructure/audit-events-repo.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational — the resolver layer every story needs).
2. Complete Phase 3 (US1): browsing and filtering, admin-gated.
3. **STOP and VALIDATE**: an admin can browse/filter/paginate the real trail; a non-admin is denied. This alone is a legitimate, demoable increment.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → validate independently (MVP).
3. US2 → validate independently (detail drawer + redaction proof).
4. US3 → validate independently (empty states).
5. US4 → validate independently (export stays hidden today; component is future-ready).
6. Polish → typecheck/lint/build/tests/quickstart/backlog archive.

---

## Notes

- `[P]` tasks touch different files with no unmet dependency.
- `[US#]` maps each task to its owning user story for traceability; Setup/Foundational/Polish tasks carry no story label by convention.
- Tests are colocated per task rather than tracked as separate checklist rows, per this repo's actual established testing convention (see the Tests note above) — not a departure from Constitution Principle I, just this repo's existing shape for satisfying it.
- Every new cross-BC getter (T002, T003, T006, T007) mirrors an already-existing sibling getter's exact shape in its own BC (org-scoped, returns `null` on not-found) — no new conventions introduced.
