# Feature Specification: Skill Sharing — Subscribe & Fork

**Feature Branch**: `020-prompt-sharing`

**Created**: 2026-07-29

**Re-specified**: 2026-07-29 — the branch's original spec (a simple per-user `PromptShare` grant, matching the legacy Python model) is superseded. `backlog/006-prompt-registry/003-prompt-sharing.md`, the backlog item this spec implements, was redesigned under [PDR-016](../../docs/pdr/016-skill-ownership-sharing-and-project-assignment.md) after the original spec was written and clarified — this document replaces it in place rather than forking a new numbered feature, since it's the same backlog item, same branch, same scope, only a different mechanism.

**Status**: Clarified

**Input**: User description: "Prompt Sharing (epic 006-prompt-registry, backlog item backlog/006-prompt-registry/003-prompt-sharing.md, depends on 018-prompt-version-model). Supersedes the branch's original input after PDR-016 redesigned skill ownership: a skill (Prompt) is now owned by exactly one user or exactly one team (owner_type/owner_id, already implemented). Sharing between any two owners (user-to-user, user-to-team, team-to-team, team-to-user) uses one universal mechanism with two modes — subscribe (a live reference that automatically follows the source's newly published versions) or fork (an independent copy under a new owner, stamped with a forked_from_skill_id lineage pointer, that never syncs further). This is also the only path by which a personal skill becomes team-owned. Required capabilities: subscribeSkill, unsubscribeSkill, forkSkill, and an accessible-skills query including owned + own-team's + subscribed skills. Explicitly out of scope: project-skill assignment (backlog 007) and prompt expansion's access-check wiring (epic 008)."

## Clarifications

### Session 2026-07-29

- Q: Subscribing/forking is self-service within an organization — but should it reach any skill in the org by id/name regardless of whether the caller could already see it some other way, or only skills already discoverable to the caller through some org-wide listing? → A: Bounded to visibility — every skill in an organization is discoverable/listable to every member of that organization (a distinct, broader guarantee than the narrower *accessible* set used for invocation); subscribe/fork may only target a skill within that discoverable set.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Subscribe to a skill owned by someone else (Priority: P1)

A user or a team subscribes to a skill owned by another user or team, gaining a live reference that automatically resolves whatever version the source currently has active — including any version published after the subscription was created.

**Why this priority**: Subscribing is the primary way a skill's improvements reach everyone using it without anyone having to manually re-pull it — it's the mechanism that makes a shared skill still feel "owned and maintained" by its source rather than a one-time snapshot.

**Independent Test**: Can be fully tested by creating a skill owned by user A, subscribing to it as user B, publishing a new version on A's skill, and confirming B's next invocation of that skill resolves the new version with no action from B.

**Acceptance Scenarios**:

1. **Given** a skill owned by user A in organization X, **When** user B (also in organization X) subscribes to it, **Then** a subscription record is created linking the skill to user B, and a `SkillSubscribed` audit event is recorded.
2. **Given** a team in organization X and a skill owned by a different team in the same organization, **When** an admin of the subscribing team subscribes the team to that skill, **Then** the subscription is created under the team (not the individual admin), and every member of the subscribing team gains access to it.
3. **Given** a non-admin member of a team, **When** they attempt to subscribe their team (not themselves) to a skill, **Then** the operation is rejected.
4. **Given** a skill owned by a user in organization X, **When** a user in organization Y attempts to subscribe to it, **Then** the operation is rejected, no subscription record is created, and no audit event is recorded.
5. **Given** an existing subscription from user B to a skill, **When** user B subscribes to the same skill again, **Then** the operation is rejected as a duplicate and no second subscription record is created.
6. **Given** a subscribed skill whose owner publishes a new version, **When** the subscriber next invokes that skill by name, **Then** the newly published version is what resolves — no separate action is needed to "pull" the update.

---

### User Story 2 - Fork a skill owned by someone else (Priority: P1)

A user or a team creates an independent copy of a skill owned by someone else, becoming the new owner of that copy, with a permanent record of which skill it was copied from.

**Why this priority**: Forking is how a recipient takes a skill in a direction the original owner doesn't want to follow, while preserving the audit trail of where it came from — without forking, the only way to build on someone else's skill would be to start from scratch or take a permanent, uncontrolled dependency via subscription.

**Independent Test**: Can be fully tested by forking a skill owned by user A into a new skill owned by team T, then publishing new versions independently on each side and confirming neither affects the other.

**Acceptance Scenarios**:

1. **Given** a skill owned by user A, **When** user B forks it, **Then** a new, independent skill is created owned by user B, containing a copy of A's skill's current active version's content, with a lineage pointer recorded back to A's skill, and a `SkillForked` audit event is recorded.
2. **Given** a skill owned by user A, **When** an admin of team T forks it into team T's ownership, **Then** the new skill is owned by team T (not the individual admin who performed the fork).
3. **Given** a non-admin member of team T, **When** they attempt to fork a skill into team T's ownership, **Then** the operation is rejected.
4. **Given** a skill in organization X, **When** a user in organization Y attempts to fork it, **Then** the operation is rejected and no new skill is created.
5. **Given** a fork created from a source skill, **When** the source skill later publishes a new version, **Then** the fork is entirely unaffected — it keeps resolving its own, independently published versions.
6. **Given** a fork created from a source skill, **When** the fork later publishes a new version, **Then** the source skill is entirely unaffected.

---

### User Story 3 - A personal skill becomes team-owned (Priority: P2)

A user's personal skill is picked up by a team — via that team subscribing to it or forking it — giving the team lasting access to (or ownership of) something that started as one person's work, without any separate "reassign owner" action ever existing.

**Why this priority**: This is the only path from personal to team ownership in the whole model; without it, a good personal skill has no way to become the team's shared asset, and a team could never build its own catalog out of what its members already made.

**Independent Test**: Can be fully tested by creating a personal skill as user A, having team T (which A may or may not belong to) fork or subscribe to it, and confirming the resulting skill (the fork) or subscription is now under team T with no change ever made to a shared "owner" field on A's original skill.

**Acceptance Scenarios**:

1. **Given** a personal skill owned by user A, **When** team T forks it, **Then** the fork is a new skill owned by team T, and user A's original skill is completely unchanged (still owned by user A).
2. **Given** a personal skill owned by user A, **When** team T subscribes to it instead of forking, **Then** team T gains a live reference to A's skill, but ownership of the original never changes — A still owns it, and no operation exists anywhere in this feature to directly transfer that ownership.

---

### User Story 4 - Unsubscribe (Priority: P2)

A user or team admin removes a subscription, so that user or team no longer has access to the subscribed skill.

**Why this priority**: A subscription that can never be removed would make every subscribe decision permanent and risk-free to over-grant — revocability keeps subscribing a low-stakes, reversible action.

**Independent Test**: Can be fully tested by subscribing to a skill, confirming it's accessible, unsubscribing, and confirming it no longer is.

**Acceptance Scenarios**:

1. **Given** a subscription from user B to a skill, **When** user B unsubscribes, **Then** the subscription record is removed and a `SkillUnsubscribed` audit event is recorded.
2. **Given** a team subscription, **When** an admin of that team unsubscribes it, **Then** the subscription is removed for the whole team; a non-admin member of that team attempting the same operation is rejected.
3. **Given** a subscription has just been removed, **When** the formerly-subscribing user's or team's accessible-skills list is retrieved, **Then** the skill no longer appears there, while every skill they own is unaffected.
4. **Given** no subscription exists between a given skill and subscriber, **When** a caller attempts to unsubscribe it anyway, **Then** the operation is rejected without side effects and no audit event is created.
5. **Given** a subscription owned by one subscriber, **When** a caller with no relationship to that subscriber attempts to remove it, **Then** the operation is rejected as if the subscription did not exist.

### Edge Cases

- What happens when a user attempts to subscribe to (or fork) a skill they already own? Rejected — an owner already has full access and there is no reasonable meaning for self-subscribing or self-forking.
- What happens when a skill is subscribed to by many different users/teams, and its owner deprecates it? The subscriptions remain in place; deprecation is a separate lifecycle flag on the skill itself and doesn't remove access, matching how deprecation already behaves for an owned skill.
- What happens when the skill referenced by a subscription is later forked by someone else (a third party, unrelated to the subscription)? No effect — a fork's independence and a subscription's live-reference behavior are both scoped to their own creator/subscriber; a third party's fork of the same source doesn't touch anyone else's subscription to that source.
- What happens when two callers concurrently attempt to subscribe the same subscriber to the same skill? Exactly one subscription record is created; the other attempt is rejected by the unique `(source skill, subscriber type, subscriber id)` constraint.
- What happens when a skill is deleted while subscriptions or forks reference it? Out of scope for this feature — skill deletion and its effect on dependent subscription/fork records is owned by whichever feature introduces skill deletion (no such feature exists yet).
- Can a skill be forked from a fork (a "fork of a fork")? Yes — a fork is a fully independent skill like any other, so it can itself be subscribed to or forked again; its `forked_from_skill_id` only ever points at its own immediate source, not transitively at the original root.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a user, or an admin of a team, to create a subscription linking a subscriber (that user, or that team) to a skill owned by a different owner.
- **FR-002**: System MUST enforce uniqueness on the combination of source skill and subscriber, so the same subscriber cannot subscribe to the same skill more than once concurrently.
- **FR-003**: System MUST reject creating a subscription where the subscriber does not belong to the same organization as the source skill.
- **FR-004**: System MUST reject creating a subscription where the subscriber already owns the source skill.
- **FR-005**: System MUST reject a team-subscription attempt from a caller who is not an admin of the subscribing team.
- **FR-006**: System MUST allow a subscriber (or, for a team subscription, an admin of that team) to remove their own subscription, with no effect on any other subscriber or on the source skill.
- **FR-007**: System MUST reject removing a subscription that does not exist, or that the caller has no authority over, without side effects.
- **FR-008**: System MUST ensure a subscriber's access to a subscribed skill always reflects that skill's *current* active version — no stale or manually-refreshed copy.
- **FR-009**: System MUST allow a user, or an admin of a team, to fork a skill owned by a different owner, creating a new, fully independent skill owned by the forking user or team.
- **FR-010**: System MUST copy the source skill's current active version's content into the new fork's own initial version at the moment of forking, and MUST NOT propagate any later change on either side to the other, in either direction, ever again.
- **FR-011**: System MUST record, on every forked skill, a permanent pointer back to the exact skill it was forked from.
- **FR-012**: System MUST reject creating a fork where the new owner does not belong to the same organization as the source skill.
- **FR-013**: System MUST reject a team-fork attempt from a caller who is not an admin of the destination team.
- **FR-014**: System MUST provide a single accessible-skills query, for a given user within a given organization, that returns exactly the skills that user owns, the skills that user's own team owns, and the skills that user (or their team) subscribes to.
- **FR-015**: System MUST exclude from a user's accessible-skills list any skill, subscription, or fork lineage belonging to a different organization, even where an id happens to coincide.
- **FR-016**: System MUST record a `SkillSubscribed` audit event for every successful subscription creation, a `SkillUnsubscribed` audit event for every successful subscription removal, and a `SkillForked` audit event for every successful fork — each including organization, skill, and actor identity.
- **FR-017**: System MUST ensure a rejected subscribe, unsubscribe, or fork operation creates no record and no audit event.
- **FR-018**: System MUST NOT provide any operation that directly changes an existing skill's owner in place — the only way a skill's effective ownership set expands is through a new subscription or a new fork.
- **FR-019**: System MUST make every skill within an organization discoverable (listable, by name/metadata) to every member of that organization, independent of ownership, subscription, or team membership — a broader guarantee than the narrower *accessible* set (FR-014), which governs actual usability for invocation, not visibility.
- **FR-020**: System MUST reject a subscribe or fork attempt targeting a skill outside the caller's own organization's discoverable set (in practice, this coincides with FR-003/FR-012's organization-boundary rejection, since the discoverable set is exactly "every skill in the caller's own organization").
- **FR-021**: System MUST reject forking a skill where the new owner already owns it — the same "an owner already has full access" rule FR-004 applies to subscribing (see Edge Cases), applied to forking too. *(Added during `/speckit-analyze`, 2026-07-29 — the Edge Cases section already promised this; no FR had formalized it.)*

### Key Entities

- **Skill**: The thing being shared (the existing `Prompt` aggregate). Owned by exactly one user or exactly one team. Carries an optional lineage pointer to the skill it was forked from, if any; that pointer is set once, at creation, and never changes afterward.
- **Subscription**: A live-reference grant from one skill to one subscriber (a user or a team), scoped within a single organization. Key attributes: source skill identity, subscriber identity (and whether that subscriber is a user or a team), and creation time. Uniqueness is enforced on the combination of source skill and subscriber; a subscription is either present (the subscriber's access always tracks the source's current version) or absent (no such access) — it has no other state.
- **Fork**: Not a separate stored entity — a fork is simply a new `Skill`, distinguished only by carrying a lineage pointer back to its source. Once created, a fork behaves exactly like any independently-owned skill.
- **Accessible Skill Set**: A read-model concept, not a stored entity — for a given user, the union of skills that user owns, skills that user's own team owns, and skills that user or their team subscribes to, always evaluated within one organization.
- **Audit Event**: A durable record for every successful subscribe, unsubscribe, and fork mutation, written through the existing audit write path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of subscribe or fork attempts that cross an organization boundary are rejected, with zero subscription or fork records created.
- **SC-002**: 100% of a user's accessible-skill results include every skill they own, every skill their own team owns, and every skill they (or their team) subscribe to, and exclude every other skill in the same organization.
- **SC-003**: Within one invocation after a source skill publishes a new version, 100% of that skill's subscribers resolve the new version — with zero additional action taken by the subscriber.
- **SC-004**: 100% of forked skills remain fully independent from their source indefinitely — no publish on either side, at any point after the fork, ever alters the other.
- **SC-005**: 100% of successful subscribe, unsubscribe, and fork operations produce their required audit event, and 100% of rejected attempts produce no audit event and no record change.
- **SC-006**: 100% of duplicate subscribe attempts on an existing (source skill, subscriber) pair are rejected with no second record created.
- **SC-007**: 100% of skills within an organization appear in that organization's discoverable listing, regardless of ownership, subscription, or team membership — discoverability never depends on any relationship to the skill.

## Assumptions

- "Caller" means an authenticated actor already resolved to an organization and user identity by the Identity/Access bounded context; authentication, membership resolution, team-admin-role resolution, and organization lookup are out of scope for this feature.
- Subscribing and forking are **self-service and org-scoped**, not owner-granted: there is no separate "share with" or "invite" step performed by the source skill's owner. Any organization member may attempt to subscribe or fork any skill within their own organization's **discoverable set** (see Clarifications — every skill in an org is discoverable to every member of that org, a real guarantee this feature depends on, not merely a deferred UI concern), subject only to this feature's own authorization rules (self, or team-admin for a team-scoped action). **Confirmed with the user 2026-07-29.**
- "Team admin" reuses whatever role/permission concept Identity & Access already exposes for team administration (the same one existing team-management operations rely on); this feature does not introduce a new permission level.
- Sharing direction is fully symmetric: a user's skill can be subscribed/forked by another user or by a team, and a team's skill can be subscribed/forked by another team or by an individual user — the mechanism does not distinguish based on which side is a user vs. a team, only which side is the source vs. the recipient.
- Prompt expansion's own access-check wiring (using the accessible-skills query this feature provides) is out of scope for this feature, same as project-skill assignment (`backlog/006-prompt-registry/007-project-skill-assignment.md`) — both are separate, dependent features.
- Audit events are written through the shared Audit & Compliance write path; defining that event schema and storage is out of scope for this feature.
- There is no subscription "role" or permission level (e.g. read vs. edit) — a subscription is a binary live-reference grant, and a fork is a one-time, unprivileged copy; neither carries any finer-grained permission.
