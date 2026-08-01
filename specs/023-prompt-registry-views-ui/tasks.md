# Tasks: Prompt Registry Views UI

**Input**: Design documents from `/specs/023-prompt-registry-views-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included, colocated with each implementation file (`*.test.ts`/`*.test.tsx` alongside the file it tests), per this repo's established convention and Constitution Principle I (test-first) — a Testcontainers-backed test for every new/changed `application/`/`infrastructure/` function, a `renderToStaticMarkup` test for every new component.

**Organization**: Tasks are grouped by user story (spec.md's P1/P2/P3/P4) to enable independent implementation and testing of each story.

## Path Conventions

Single unified Next.js app (`src/` at repo root) — see `plan.md`'s Project Structure. No `backend/`/`frontend/` split.

---

## Phase 1: Setup

**Purpose**: Confirm the ground this feature composes into is actually in place before writing anything new.

- [X] T001 Verify `src/app/(app)/_components/nav-model.ts`'s existing `prompts`/`projects` entries (`href: "/prompts"` / `"/projects"`) and the `(app)` route group's `resolveAppShellAccess()` layout gate compose correctly with this feature's planned routes — no code change expected, verification only

**Checkpoint**: Confirmed both routes this feature builds already have live nav entries and a shell to land in (currently 404 — this feature is what fills them in).

---

## Phase 2: Foundational (Blocking Prerequisites)

**None required beyond Setup.** Unlike `020-audit-log-ui` (whose every story needed one shared cross-BC name-resolution layer), this feature's three new backend capabilities — `reactivatePrompt`, project-as-subscriber sharing, and `project_repos` — are each needed by exactly one user story, and the `prompts/*` and `projects/*` route trees are independent enough that no shared resolver or shared component is a blocking prerequisite for more than one story. Each story's phase below brings its own new capability.

---

## Phase 3: User Story 1 - Browse, search, and inspect a prompt (Priority: P1) 🎯 MVP

**Goal**: A user can open `/prompts`, search/filter the list, open a prompt's detail view (template, rendered preview, applied policies), and deprecate/reactivate a prompt they own.

**Independent Test**: Create a prompt, confirm it's findable via search and project/owner filters, open its detail view and confirm the template/preview/policies tabs render correctly, deprecate it and confirm the badge appears everywhere, reactivate it and confirm the badge clears.

- [X] T002 [US1] Implement `reactivatePrompt(db, actor: PromptActor, promptName)` (mirrors `deprecate-prompt.ts`, sets `isDeprecated: false`, audited as `prompt.reactivated`) + test in `src/bcs/prompt-registry/application/reactivate-prompt.ts` / `reactivate-prompt.test.ts`
- [X] T003 [US1] Fix `deprecatePrompt` to wrap its mutation in `withAudit`/`record()` (`prompt.deprecated`) in `src/bcs/prompt-registry/application/deprecate-prompt.ts`; update `deprecate-prompt.test.ts` to assert the audit event now exists (per research.md's audit-gap fix)
- [X] T004 Export `reactivatePrompt` from `src/bcs/prompt-registry/index.ts`; update `CONTRACT.md`'s Exposed APIs table (`reactivatePrompt`) and Events Published table (`PromptDeprecated`/`PromptReactivated`) (depends on T002, T003)
- [X] T005 [P] [US1] Implement server page `src/app/(app)/prompts/page.tsx`: `withTenantContext` + `listPrompts` + `listSkillsByOrganization` (for the project-filter option list), parsing search/project/owner filters from `searchParams`
- [X] T006 [P] [US1] Implement `prompts-list-view.tsx` — pure "View" component: header, search input, project-filter dropdown, owner segmented control (All/Mine/Shared), Clear-filters action, two distinct empty states ("nothing yet" vs. "no match"), row list (name + deprecated badge, project label(s), owner avatar+name, active version badge, tag chips, updated date) + test in `src/app/(app)/prompts/prompts-list-view.tsx` / `.test.tsx`
- [X] T007 [US1] Implement thin client wrapper `prompts-list.tsx` (owns `useRouter`/`useSearchParams`, debounces search before writing to the URL query string per research.md's filter-persistence decision) in `src/app/(app)/prompts/prompts-list.tsx` (depends on T006) — untested directly per this repo's router-context testing gotcha
- [X] T008 [P] [US1] Implement `new-prompt-drawer.tsx` (name, description, system template + tooltip, user template + tooltip, tags + tooltip) + test in `src/app/(app)/prompts/new-prompt-drawer.tsx` / `.test.tsx`
- [X] T009 [US1] Implement `src/app/(app)/prompts/actions.ts`: `requireActingUser()` helper (mirrors `teams/actions.ts`'s pattern) + `createPromptAction`, `deprecatePromptAction`, `reactivatePromptAction` (each: auth → `withTenantContext` → BC call → `revalidatePath("/prompts")`); wire `new-prompt-drawer.tsx`'s (T008) submit handler to `createPromptAction`, closing the drawer and refreshing the list on success (depends on T002, T003, T008)
- [X] T010 [US1] Implement server page `src/app/(app)/prompts/[name]/page.tsx`: `getPrompt` + `expand()` (rendered preview) + owner/project-label resolution (existing functions only — no new backend work)
- [X] T011 [P] [US1] Implement `prompt-detail-view.tsx` — pure "View": header (name, deprecated badge, deprecate/reactivate action, version badge + dropdown, owner, project label(s)), Template tab (system/user templates, input schema list), Preview tab (rendered system/user message from `expand()`), Applied-policies tab (label + enforcement-type badge per policy) + test in `src/app/(app)/prompts/[name]/prompt-detail-view.tsx` / `.test.tsx`
- [X] T012 [US1] Implement thin client wrapper `prompt-detail.tsx` (tab state, router context) in `src/app/(app)/prompts/[name]/prompt-detail.tsx` (depends on T011)
- [X] T013 [US1] Wire deprecate/reactivate actions from T009 into `prompt-detail-view.tsx`'s header controls; extend its test with both action states (depends on T009, T011)

**Checkpoint**: User Story 1 fully functional and independently testable — browse, search, inspect, deprecate/reactivate.

---

## Phase 4: User Story 2 - Create a prompt and publish new versions (Priority: P2)

**Goal**: A user can publish a new immutable version of a prompt (optionally activating it immediately) and browse/restore any prior version via version history.

**Independent Test**: Publish a second version with different templates, confirm both versions remain independently viewable, open version history and set the first version active again.

- [X] T014 [US2] Fix `rollbackPrompt` to wrap its mutation in `withAudit`/`record()` (`prompt.version_activated`) in `src/bcs/prompt-registry/application/rollback-prompt.ts`; update `rollback-prompt.test.ts` accordingly (per research.md's audit-gap fix)
- [X] T015 Update `CONTRACT.md`'s Events Published table for `PromptVersionActivated` (depends on T014)
- [X] T016 [P] [US2] Implement `new-version-drawer.tsx` (info banner naming the next version number, system/user template textareas pre-filled from the active version, tags input, "set active immediately" checkbox) + test in `src/app/(app)/prompts/[name]/new-version-drawer.tsx` / `.test.tsx`
- [X] T017 [P] [US2] Implement `version-history-drawer.tsx` (every version: number, date, tags, active/inactive, "Set active" button on inactive ones) + test in `src/app/(app)/prompts/[name]/version-history-drawer.tsx` / `.test.tsx`
- [X] T018 [US2] Extend `src/app/(app)/prompts/actions.ts`: `publishVersionAction`, `rollbackPromptAction` (depends on T014)
- [X] T019 [US2] Wire the new-version and version-history drawers into `prompt-detail-view.tsx` (open/close state, version dropdown's "View full history" entry point) + extend its test (depends on T011, T016, T017, T018)

**Checkpoint**: User Stories 1 AND 2 both independently functional — browse/inspect/deprecate plus create/version.

---

## Phase 5: User Story 3 - Share a prompt with people and teams (Priority: P3)

**Goal**: A prompt owner can grant/revoke access to individual users, teams, and projects; recipients subscribe (live) or fork (independent copy).

**Independent Test**: Share with a user and a team, confirm both appear with correct subscriber/copy counts; share with a project, confirm every member of that project — even one on none of the prompt's owning/subscribed teams — gains accessible-list access; revoke one grant and confirm only its recipients lose access.

- [X] T020 [US3] Widen `SubscriberType` to `"user" | "team" | "project"` in `src/bcs/prompt-registry/domain/subscription.ts` (keep `OwnerType` as `"user" | "team"`, unchanged); widen the matching TS enum literal on `subscriptions.subscriberType` in `src/bcs/prompt-registry/infrastructure/schema.ts` (no migration needed — plain `text` column, per research.md)
- [X] T021 [US3] Extend `assertAuthorizedForOwner` in `src/bcs/prompt-registry/application/authorize-owner-action.ts` with a new `ownerType === "project"` branch (resolves via sibling `getProject()`, throws `CrossOrgSubscriberError` if not found, otherwise delegates to the existing `"team"` branch on `project.teamId`) + test cases: org admin succeeds, project's owner-team admin/owner succeeds, unrelated org member rejected, cross-org project id rejected (depends on T020)
- [X] T022 [P] [US3] Add `listProjectIdsForUser(tx, userId)` to `src/bcs/prompt-registry/infrastructure/project-members-repo.ts` + test
- [X] T023 [US3] Extend `listAccessibleByOwnerAndSubscriptions` (`infrastructure/prompts-repo.ts`) and `listPrompts` (`application/list-prompts.ts`) with a third subscriber-kind branch (`subscriberType: "project"`, `subscriberId IN` the caller's project ids from T022) + test: a project member with no direct user/team grant still sees a project-shared prompt in their accessible list (depends on T020, T022)
- [X] T024 Update `src/bcs/prompt-registry/index.ts` type exports and `CONTRACT.md`'s `subscribeSkill`/`unsubscribeSkill` rows for the widened `subscriberType`, **and** `listPrompts`'s own row (its accessible-set description must now mention project-membership subscriptions, not just user/team) (depends on T021, T023)
- [X] T025 [P] [US3] Implement `share-drawer.tsx` (subscribe-vs-fork explainer banner, search box, People list with grant/revoke toggle, Teams-already-shared list with subscriber/copy counts + revoke, "share to another team" picker, Projects list with grant/revoke toggle) + test in `src/app/(app)/prompts/[name]/share-drawer.tsx` / `.test.tsx`
- [X] T026 [US3] Extend `src/app/(app)/prompts/actions.ts`: `subscribeSkillAction`, `unsubscribeSkillAction`, `forkSkillAction` (depends on T021)
- [X] T027 [US3] Wire the share drawer into `prompt-detail-view.tsx`/`[name]/page.tsx` (assemble `shareState` view-model per data-model.md) + extend tests (depends on T023, T025, T026)

**Checkpoint**: User Stories 1-3 independently functional — browse through sharing.

---

## Phase 6: User Story 4 - Curate and organize project prompts (Priority: P4)

**Goal**: A project lead can create a project, manage its collaborator teams/members/repositories, and curate which prompts are required/optional for it.

**Independent Test**: Create a project, add a collaborator team, link a repository, add an individual member, mark a prompt required then optional then remove it.

- [X] T028 [P] [US4] Implement `project-identity-verifier.ts` — the first real `ProjectIdentityVerifier`, composing `identity-access`'s `getOrganization`/`getTeam`/`getUser` (each wrapped to return `boolean`, per research.md) + test in `src/app/(app)/projects/project-identity-verifier.ts` / `.test.ts`
- [X] T029 [US4] Add `projectRepos` table to `src/bcs/prompt-registry/infrastructure/schema.ts` (per data-model.md); generate, rename, and re-tag the migration per this repo's convention; add its RLS policy (join through parent `projects`, mirroring `project_teams`'s pattern) in the same migration file, `drizzle/migrations/<timestamp>_prompt_registry_project_repos.sql`
- [X] T030 [US4] Create `src/bcs/prompt-registry/domain/project-repo.ts` (`ProjectRepo`, `AddProjectRepoParams`, `ProjectRepoNotFoundError`, `DuplicateProjectRepoError`) (depends on T029)
- [X] T031 [P] [US4] Implement `src/bcs/prompt-registry/infrastructure/project-repos-repo.ts` (`insert`, `deleteById`, `listByProject`, `findByProjectAndUrl`) + test (depends on T029, T030)
- [X] T032 [US4] Implement `addProjectRepo`/`removeProjectRepo`/`listProjectRepos` (owner-team-admin authorized via `assertAuthorizedForOwner(db, actingUser, "team", project.teamId)`, audited `project_repo.added`/`project_repo.removed`, modeled on `add-collaborator-team.ts`/`remove-collaborator-team.ts`/`list-project-teams.ts`) + tests in `src/bcs/prompt-registry/application/add-project-repo.ts`, `remove-project-repo.ts`, `list-project-repos.ts` (depends on T031)
- [X] T033 Export the three new functions from `src/bcs/prompt-registry/index.ts`; update `CONTRACT.md`'s Exposed APIs and Events Published tables (depends on T032)
- [X] T034 [P] [US4] Implement server page `src/app/(app)/projects/page.tsx`: `listProjectsByOrganization`
- [X] T035 [P] [US4] Implement `projects-list-view.tsx` (row per project: name, team label(s), description, lead, member count, prompt count) + thin wrapper `projects-list.tsx` + test in `src/app/(app)/projects/projects-list-view.tsx` / `.test.tsx`
- [X] T036 [P] [US4] Implement `new-project-drawer.tsx` (name, team select from `listTeams`, lead select from `listUsers`, description) + test in `src/app/(app)/projects/new-project-drawer.tsx` / `.test.tsx`
- [X] T037 [US4] Implement `src/app/(app)/projects/actions.ts`: `createProjectAction` (uses T028's verifier), `updateProjectAction`, `addProjectMemberAction`, `removeProjectMemberAction`, `addCollaboratorTeamAction`, `removeCollaboratorTeamAction`, `addProjectRepoAction`, `removeProjectRepoAction`; wire `new-project-drawer.tsx`'s (T036) submit handler to `createProjectAction`, closing the drawer and refreshing the list on success (depends on T028, T032, T036)
- [X] T038 [US4] Implement server page `src/app/(app)/projects/[id]/page.tsx`: `getProject` + `listProjectMembers` + `listProjectTeams` + `listProjectRepos` + `listRequiredSkillsForProject` + `listSkillsByOrganization` (to compute the required/optional/available partition) (depends on T032)
- [X] T039 [P] [US4] Implement `project-detail-view.tsx` — pure "View": header, Members/Prompts/Repositories/Teams tabs (no Metrics tab, per spec.md Assumptions), each with its own empty state + test in `src/app/(app)/projects/[id]/project-detail-view.tsx` / `.test.tsx`
- [X] T040 [US4] Implement thin client wrapper `project-detail.tsx` (tab state, router context) (depends on T039)
- [X] T041 [P] [US4] Implement `add-team-drawer.tsx` (addable-teams list, one-click Add) + test
- [X] T042 [P] [US4] Implement `add-member-drawer.tsx` (org user picker + role) — new; fills the mockup's unwired "+ add member" button per spec.md Assumptions + test
- [X] T043 [P] [US4] Implement `add-repo-drawer.tsx` (name, URL, branch) + test
- [X] T044 [US4] Add `assignSkillToProjectAction`/`unassignSkillFromProjectAction` to `src/app/(app)/prompts/actions.ts` (wraps existing, already-tested BC functions — no new backend logic; used by both the Prompts tab below and T045's drawer)
- [X] T045 [P] [US4] Implement `assign-projects-drawer.tsx` (None/Optional/Required per-project toggle, shown from the prompt detail page) + test in `src/app/(app)/prompts/[name]/assign-projects-drawer.tsx` / `.test.tsx` (depends on T044)
- [X] T046 [US4] Wire add-team/add-member/add-repo drawers and the Prompts tab's required/optional/available curation (using T044's actions) into `project-detail-view.tsx`/`[id]/page.tsx` + extend tests (depends on T037, T038, T039, T041, T042, T043, T044)
- [X] T047 [US4] Wire `assign-projects-drawer.tsx` into `prompt-detail-view.tsx`'s "Projects" action (depends on T011, T045)

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T048 Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` (the build step specifically to catch any accidental Node-only import leaking into a `"use client"` component, per this repo's documented `.next/standalone` gotcha) — all three clean; `pnpm build` confirms `/prompts`, `/prompts/[name]`, `/projects`, `/projects/[id]` all compile as real dynamic routes
- [X] T049 Run `pnpm vitest run` for the full new/changed file set (all four stories) and confirm green — extended to the **entire** suite (not just this feature's files) to catch any regression from touching shared code (`authorize-owner-action.ts`, `list-prompts.ts`): 170 files / 716 tests, all passing, zero regressions
- [ ] T050 **(blocked)** Manually execute `quickstart.md` end-to-end against a real dev database — attempted, but a concurrent session held an exclusive `next dev` lock on this shared repo directory (Next.js 16 refuses a second dev server against the same project directory even on a different port) and killing that session's process to free it up was avoided per this repo's own established non-disruption convention (see `CLAUDE.md`'s Testcontainers-concurrency and Multica-workspace notes for the same principle applied elsewhere). Applied the new migration (`pnpm db:migrate`) against the shared dev Postgres successfully; `pnpm build`'s route compilation plus the full automated suite (T049) are the verification actually completed. Recommend re-running this task manually once the port is free, or from an isolated worktree.
- [X] T051 Updated `backlog/006-prompt-registry/006-prompt-registry-views-ui.md` frontmatter to `status: done`, checked off its Requirements/Acceptance Criteria (noting T050's caveat), moved it to `archive/`, and updated `EPIC.md`'s checkbox + link. Also caught and fixed `005-prompt-registry-tenant-isolation-tests.md` sitting fully-shipped-but-unarchived (delivered by `022-prompt-registry-tenant-isolation`, confirmed via its migration + `tenant-isolation.test.ts` covering all 6 named tables) — archived it too, in the same change.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: None (see note above) — user stories may begin immediately after Setup.
- **User Stories (Phase 3-6)**: US1 (P1) has no dependency on any other story. US2 (P2) and US3 (P3) both extend files US1 creates (`prompt-detail-view.tsx`, `prompts/actions.ts`) but introduce no new *cross-story* backend dependency on each other. US4 (P4) lives entirely under a separate route tree (`projects/*`) and depends on no prior story's UI, though T044-T047 bridge back into `prompts/*` to wire prompt-side project curation.
- **Polish (Phase 7)**: Depends on all four user stories.

### Within Each User Story

- US1: T002+T003 (parallel, different concerns) → T004 → T009 (needs T002,T003,T008); T005/T006/T008 parallel → T007 (needs T006) → T010 → T011 (parallel with T005-T009) → T012 (needs T011) → T013 (needs T009,T011)
- US2: T014 → T015; T016/T017 parallel → T018 (needs T014) → T019 (needs T011,T016,T017,T018)
- US3: T020 → T021 (needs T020); T022 parallel with T020/T021 → T023 (needs T020,T022) → T024 (needs T021,T023); T025 parallel → T026 (needs T021) → T027 (needs T023,T025,T026)
- US4: T028 parallel with T029; T029 → T030 → T031 → T032 → T033; T034/T035/T036 parallel (only need Setup) → T037 (needs T028,T032) → T038 (needs T032) → T039 (parallel with T034-T038) → T040 (needs T039); T041/T042/T043 parallel → T044 → T045 (needs T044) → T046 (needs T037,T038,T039,T041,T042,T043,T044) → T047 (needs T011,T045)

### Parallel Opportunities

- US1: T005, T006, T008 in parallel (different files); T011 can start in parallel with T005-T009 (different route segment)
- US2: T016 and T017 in parallel
- US3: T020/T022 in parallel; T025 in parallel with T020-T024
- US4: T028 and T029 in parallel (different concerns entirely); T034/T035/T036 in parallel; T041/T042/T043 in parallel
- Once Setup is done, a team could staff US1, and (after US1's T011 exists as a stub to extend) US4 fully in parallel, since US4's route tree is independent

---

## Parallel Example: User Story 1

```bash
Task: "Implement reactivatePrompt in src/bcs/prompt-registry/application/reactivate-prompt.ts"
Task: "Fix deprecatePrompt's missing audit call in src/bcs/prompt-registry/application/deprecate-prompt.ts"
Task: "Implement prompts/page.tsx"
Task: "Implement prompts-list-view.tsx"
Task: "Implement new-prompt-drawer.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 3 (US1): browse, search, inspect, deprecate/reactivate.
3. **STOP and VALIDATE**: a user can find and fully inspect a prompt (template, governed preview, applied policies) and toggle its deprecated state. This alone is a legitimate, demoable increment — the registry's core "read" value.

### Incremental Delivery

1. Setup → foundation confirmed.
2. US1 → validate independently (MVP).
3. US2 → validate independently (versioning).
4. US3 → validate independently (sharing, including the new project-grant semantics).
5. US4 → validate independently (project setup + curation).
6. Polish → typecheck/lint/build/tests/quickstart/backlog archive.

---

## Notes

- `[P]` tasks touch different files with no unmet dependency.
- `[US#]` maps each task to its owning user story for traceability; Setup/Polish tasks carry no story label by convention. Tasks with no `[US#]` inside a story's phase range (e.g. T004, T015, T024, T033) are barrel-export/`CONTRACT.md` bookkeeping that closes out that story's new capability rather than user-facing work of its own — left unlabeled to match this repo's existing convention that such tasks are supporting infrastructure, not a distinct testable slice.
- Three genuinely new backend capabilities in this feature (`reactivatePrompt`, project-as-subscriber sharing, `project_repos`) and two audit-logging fixes (`deprecatePrompt`, `rollbackPrompt`) are called out explicitly in research.md — everything else this feature touches in `src/bcs/prompt-registry` already existed, tested, but with no real caller before this feature.
- T051 (backlog archival) follows this repo's established convention: move to `archive/`, don't just flip `status` in place, and update the epic's own link in the same change.
