# Tasks: Skill Sharing — Subscribe & Fork

**Feature**: 020-prompt-sharing
**Branch**: `020-prompt-sharing`
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md) | **Data Model**: [data-model.md](./data-model.md)

---

## Phase 1: Setup

- [X] T001 Verify project environment (Node.js, pnpm, TypeScript, Vitest, Drizzle all configured — existing project, same as `018-prompt-version-model`)

---

## Phase 2: Foundational

- [X] T002 Add `subscribed` (violet), `unsubscribed` (red), `forked` (green) verbs and color entries to `AUDIT_ACTION_VERBS`/`AUDIT_ACTION_VERB_COLORS` in `src/bcs/audit-compliance/domain/audit-event.ts`
- [X] T003 Extend `src/bcs/prompt-registry/infrastructure/schema.ts` with the `subscriptions` Drizzle table definition per `data-model.md` (FK to `prompts.id` with `onDelete: cascade`, unique on `(source_skill_id, subscriber_type, subscriber_id)`)
- [X] T004 Create `src/bcs/prompt-registry/domain/subscription.ts` — `Subscription`/`SubscriberType`/`OwnerType` types (reuse `OwnerType` from `domain/prompt.ts` if already exported), and error classes: `SubscriptionNotFoundError`, `DuplicateSubscriptionError`, `CrossOrgSubscriberError`, `CannotSubscribeToOwnSkillError`, `CannotForkOwnSkillError` (FR-021), `SubscriberNotAuthorizedError`
- [X] T005 Create `src/bcs/prompt-registry/infrastructure/subscriptions-repo.ts` with raw queries: `insertSubscription`, `findBySourceAndSubscriber`, `findByOrgAndId`, `deleteById`, `listBySubscriber(orgId, subscriberType, subscriberId)`
- [X] T006 Extend `src/bcs/prompt-registry/infrastructure/prompts-repo.ts` with `listAccessibleByOwnerAndSubscriptions(tx, organizationId, userId, userTeamId)` — one joined query returning the union of owned + own-team-owned + subscribed skills, de-duplicated, per `data-model.md`'s Query Shapes section
- [X] T007 Create `src/bcs/prompt-registry/application/authorize-owner-action.ts` — shared internal helper `assertAuthorizedForOwner(tx, actingUser, ownerType, ownerId)`: for `"user"`, requires `ownerId === actingUser.id`; for `"team"`, requires `actingUser.role === "admin"` or `(await getTeam(tx, actingUser.orgId, ownerId)).ownerId === actingUser.id` (per `research.md`'s authorization decision — reuses `identity-access`'s exported `getTeam`, does not import its internals)
- [X] T008 [P] Rewrite `src/bcs/prompt-registry/application/list-prompts.ts` to call `listAccessibleByOwnerAndSubscriptions` (the *accessible* set) instead of `listPromptsByOrg`, per `bcs/prompt-registry/CONTRACT.md`'s committed signature; rewrite `list-prompts.test.ts` accordingly — assert both exclusions separately: (a) a skill in the *same* org that the caller neither owns, nor their team owns, nor subscribes to is excluded (FR-014), and (b) a skill in a *different* org is excluded even where relevant ids coincide (FR-015)
- [X] T009 [P] Create `src/bcs/prompt-registry/application/list-skills-by-organization.ts` — `listSkillsByOrganization(db, organizationId)`, a direct passthrough to the existing `listPromptsByOrg` (the *discoverable* set, FR-019/FR-020); create `list-skills-by-organization.test.ts` proving it returns every skill in the org regardless of ownership/subscription
- [X] T010 Create `src/bcs/prompt-registry/application/subscription-test-helpers.ts` — shared fixtures: `makeSubscriptionFixtureOrg` (two orgs, a user-owned skill, a team with a real `owner_id`, a second team, a second user), `createTestSkillOwnedByUser`, `createTestSkillOwnedByTeam`, `queryPromptRows`/`querySubscriptionRows`/`querySubscriptionAuditEvents` (mirrors `prompt-test-helpers.ts`'s shape)

---

## Phase 3: User Story 1 — Subscribe to a skill owned by someone else (P1)

**Goal**: A user or team subscribes to a skill owned by a different owner and always resolves its current active version.

**Independent Test**: Subscribe user B to user A's skill; publish a new version as A; confirm B's next invocation resolves the new version with zero action from B.

- [X] T011 [US1] Create `src/bcs/prompt-registry/application/subscribe-skill.ts` — `subscribeSkill(db, actingUser, sourceSkillId, { subscriberType, subscriberId }, auditContext?)`: validates source exists and belongs to caller's org, rejects self-subscription (`CannotSubscribeToOwnSkillError`), validates `subscriberId` belongs to the same org, calls `assertAuthorizedForOwner` for `subscriberType: "team"`, rejects duplicate `(sourceSkillId, subscriberType, subscriberId)`, writes the row via `withAudit` with a `SkillSubscribed` audit event (`action: "skill.subscribed"`)
- [X] T012 [P] [US1] Create `src/bcs/prompt-registry/application/subscribe-skill.test.ts` — tests: user subscribes to another user's skill (audit event recorded); team subscribes via its `owner_id` admin (subscription recorded under the team, not the individual); non-owner-admin team-subscribe attempt rejected; cross-org subscribe rejected (no row, no audit event); duplicate subscribe rejected; self-subscribe rejected; after a new version is published on the source, the subscriber's next `getPrompt`/`expand`-equivalent resolves the new `active_version_id` with no extra action

---

## Phase 4: User Story 2 — Fork a skill owned by someone else (P1)

**Goal**: A user or team creates a fully independent copy of someone else's skill, with a permanent lineage pointer, that never re-syncs in either direction.

**Independent Test**: Fork user A's skill into team T; publish new versions on both sides independently; confirm neither affects the other.

- [X] T013 [US2] Create `src/bcs/prompt-registry/application/fork-skill.ts` — `forkSkill(db, actingUser, sourceSkillId, { ownerType, ownerId }, auditContext?)`: validates source exists and belongs to caller's org, rejects forking into an owner that already owns the source (`CannotForkOwnSkillError`, FR-021), validates `ownerId` belongs to the same org, calls `assertAuthorizedForOwner` for `ownerType: "team"`, reads the source's current active `PromptVersion` content, creates a new `Prompt` row (`owner_type`, `owner_id`, `forked_from_skill_id: sourceSkillId`) plus one new initial `PromptVersion` copying the source's template/input-schema/tags content, all within one `withAudit` transaction emitting `SkillForked` (`action: "skill.forked"`)
- [X] T014 [P] [US2] Create `src/bcs/prompt-registry/application/fork-skill.test.ts` — tests: user forks another user's skill (new independent `Prompt` row, `forked_from_skill_id` set, audit event recorded); team fork via its `owner_id` admin; non-owner-admin team-fork attempt rejected; cross-org fork rejected; **self-fork rejected — forking a skill into an owner that already owns it (FR-021)**; publishing a new version on the **source** after forking never changes the fork's `active_version_id`; publishing a new version on the **fork** never changes the source's `active_version_id`; forking a fork sets `forked_from_skill_id` to that fork's own id, not transitively to the original root

---

## Phase 5: User Story 3 — A personal skill becomes team-owned (P2)

**Goal**: Prove the only path from personal to team ownership is a team forking or subscribing — never a direct reassignment — and that the original personal skill is never mutated by either.

**Independent Test**: Team T forks (and, separately, subscribes to) a personal skill owned by user A; confirm A's original skill's `owner_type`/`owner_id` are completely unchanged in both cases.

- [X] T015 [P] [US3] Create `src/bcs/prompt-registry/application/personal-to-team-sharing.test.ts` — tests: team forks a personal skill → fork is owned by the team, original skill's `owner_type`/`owner_id` unchanged; team subscribes to a personal skill → subscription recorded under the team, original skill's `owner_type`/`owner_id` unchanged; assert no function anywhere in this bounded context's public API (`index.ts`) can change an existing skill's `owner_type`/`owner_id` in place (characterization-style check, mirroring `018`'s immutability characterization test)

---

## Phase 6: User Story 4 — Unsubscribe (P2)

**Goal**: A subscriber (or a team's owning admin) removes a subscription, ending that access with no effect on anyone else.

**Independent Test**: Subscribe, confirm the skill appears in the subscriber's accessible list, unsubscribe, confirm it no longer does.

- [X] T016 [US4] Create `src/bcs/prompt-registry/application/unsubscribe-skill.ts` — `unsubscribeSkill(db, actingUser, subscriptionId, auditContext?)`: loads the subscription (rejects if nonexistent, no side effects), calls `assertAuthorizedForOwner` using the subscription's own `subscriberType`/`subscriberId`, deletes the row via `withAudit` emitting `SkillUnsubscribed` (`action: "skill.unsubscribed"`)
- [X] T017 [P] [US4] Create `src/bcs/prompt-registry/application/unsubscribe-skill.test.ts` — tests: subscriber unsubscribes their own subscription (audit event recorded, `listPrompts` no longer includes the skill, owned skills unaffected); team's owner-admin unsubscribes a team subscription (non-admin rejected); unsubscribing a nonexistent subscription rejected with no side effects; unsubscribing a subscription the caller has no authority over rejected

---

## Phase 7: Polish & Cross-Cutting

- [X] T018 Extend `src/bcs/prompt-registry/index.ts` to re-export `subscribeSkill`, `unsubscribeSkill`, `forkSkill`, `listSkillsByOrganization`, and all new types/errors from `domain/subscription.ts`
- [X] T019 Review `src/bcs/prompt-registry/CONTRACT.md` and `OWNERSHIP.md` (already updated during the PDR-016 design session) against what was actually implemented — correct any signature or table detail that diverged during implementation
- [X] T020 Generate and apply a Drizzle migration for `prompt_registry.subscriptions` — per `CLAUDE.md`'s documented workaround for this repo's missing-snapshot-files gap (`backlog/000-foundations/011-fix-missing-migration-snapshot-files.md`): let `pnpm db:generate` produce its diff, keep the auto-generated snapshot, hand-trim the `.sql` file to just this real change, rename the file and its `_journal.json` `tag` to this repo's `<timestamp>_prompt_registry_subscriptions` convention, and verify the new entry's `when` isn't out of order
- [X] T021 Run `pnpm typecheck`, `pnpm lint`, and `pnpm vitest run src/bcs/prompt-registry src/bcs/audit-compliance` — fix any failures before considering this feature done

---

## Dependencies

```
T002 → T011, T013, T016 (audit verbs must exist before any function writes them)
T003 → T005, T006 (schema needed by repos)
T004 → T005, T007, T011, T013, T016 (domain types/errors needed everywhere)
T005 → T006, T011, T013, T016 (subscriptions-repo needed by the accessible query and all three mutations)
T006 → T008 (accessible-set repo query needed by the list-prompts rewrite)
T007 → T011, T013, T016 (shared authorization helper needed by all three mutations)
T008, T009, T010 → T012, T014, T015, T017 (list rewrite, discoverable list, and fixtures needed by every story's tests)
T011 → T012
T013 → T014
T011, T013 → T015 (personal-to-team tests exercise both subscribe and fork)
T016 → T017
T011...T017 → T018 → T019 → T020 → T021
```

## Parallel Execution

Within each phase, tasks marked `[P]` can run in parallel (different files).

Phase 2: T008, T009 can run in parallel once T006 and T010 are done.
Phase 3: T012 after T011.
Phase 4: T014 after T013.
Phase 5: T015 can run in parallel with Phase 6 (independent file, no shared dependency beyond Phase 2).
Phase 6: T017 after T016.

## Implementation Strategy

**MVP = Phase 3 + Phase 4** (both P1: subscribe and fork together) — per PDR-016, these are "one universal mechanism with two modes," not two independent features; subscribing alone doesn't deliver the sharing capability the spec describes without forking also being available, and vice versa. Phase 5 (personal→team characterization) and Phase 6 (unsubscribe) are each independently testable P2 increments layered on top.
