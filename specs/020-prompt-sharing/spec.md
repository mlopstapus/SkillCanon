# Feature Specification: Prompt Sharing

**Feature Branch**: `020-prompt-sharing`

**Created**: 2026-07-29

**Status**: Clarified

**Input**: User description: "Prompt Sharing (epic 006-prompt-registry, backlog item backlog/006-prompt-registry/003-prompt-sharing.md, depends on 018-prompt-version-model). Port PromptShare from the current Python models.py/prompt_service.py into the prompt-registry bounded context. Add a prompt_registry.prompt_shares table (id, prompt_id, user_id, created_at, unique on (prompt_id, user_id)) granting a specific user access to a prompt they don't own. Invariant: the shared-with user_id must belong to the same organization_id as the prompt being shared — cross-organization sharing must be rejected. Support creating a share, revoking a share, and listing a user's accessible prompts (prompts they own plus prompts shared with them). Acceptance criteria: sharing with a user from a different organization is rejected; a user's accessible-prompts list correctly includes both owned and shared-with prompts; revoking a share removes the prompt from that user's accessible list. This is the access-control input to the \"not found or not shared with you\" check used by epic 008's REST expand route (and its skill-sync CLI feature), and potentially the MCP feature's sh-run — the accessible-prompts query here must be the single source of truth that Distribution calls into rather than each caller re-deriving access logic itself."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Grant a user access to a prompt they don't own (Priority: P1)

An authenticated caller shares an existing prompt in their organization with another user in that same organization, so that user can subsequently see and use the prompt without becoming its owner.

**Why this priority**: Sharing is the entire point of this feature — without the ability to grant access, there is nothing to revoke and nothing to list. It is the foundation every other scenario builds on.

**Independent Test**: Can be fully tested by creating a prompt owned by user A in organization X, sharing it with user B (also in organization X), and confirming the share is recorded and user B's accessible-prompts list now includes it.

**Acceptance Scenarios**:

1. **Given** a prompt owned by user A in organization X and user B who is also a member of organization X, **When** user A shares the prompt with user B, **Then** a share record is created linking the prompt and user B, and a `PromptShared` audit event is recorded.
2. **Given** a prompt already shared with user B, **When** the same prompt is shared with user B again, **Then** the operation is rejected as a duplicate and no second share record or audit event is created.
3. **Given** a prompt in organization X, **When** a caller attempts to share it with a user who belongs to organization Y instead, **Then** the operation is rejected, no share record is created, and no audit event is recorded.
4. **Given** a prompt that does not exist (or belongs to another organization from the caller's point of view), **When** a caller attempts to share it, **Then** the operation is rejected as if the prompt did not exist.

---

### User Story 2 - List a user's accessible prompts (Priority: P1)

A caller retrieves the full set of prompts a given user can use — the prompts that user owns plus every prompt shared with them — as a single, authoritative list.

**Why this priority**: Every downstream consumer (prompt expansion's "not found or not shared with you" check, prompt listing in the CLI/UI, MCP tooling) depends on one correct, reusable answer to "what can this user see," rather than each caller re-deriving ownership-or-shared logic independently.

**Independent Test**: Can be fully tested by giving a user one owned prompt and one shared-with prompt, then confirming the accessible-prompts list returns exactly those two and excludes an unrelated third prompt in the same organization that is neither owned nor shared.

**Acceptance Scenarios**:

1. **Given** a user owns prompt P1 and has been shared prompt P2 (owned by someone else) in the same organization, **When** the user's accessible-prompts list is retrieved, **Then** the list includes both P1 and P2.
2. **Given** a third prompt P3 in the same organization that the user neither owns nor has been shared, **When** the user's accessible-prompts list is retrieved, **Then** P3 is not included.
3. **Given** a prompt P4 owned by, or shared with, a user in a different organization, **When** a user in organization X retrieves their accessible-prompts list, **Then** P4 is never included regardless of any share record referencing that user's id.
4. **Given** a user with no owned prompts and no shares, **When** their accessible-prompts list is retrieved, **Then** an empty list is returned.

---

### User Story 3 - Revoke a previously granted share (Priority: P2)

A caller revokes an existing share so the previously shared-with user no longer has access to that prompt.

**Why this priority**: Access granted must also be revocable — without revocation, sharing is a one-way, unmanageable grant, which is unacceptable for an access-control feature.

**Independent Test**: Can be fully tested by sharing a prompt with a user, confirming it appears in that user's accessible-prompts list, revoking the share, and confirming it no longer appears.

**Acceptance Scenarios**:

1. **Given** a prompt shared with user B, **When** the share is revoked, **Then** the share record is removed and a `PromptShareRevoked` audit event is recorded.
2. **Given** a share was just revoked, **When** user B's accessible-prompts list is retrieved, **Then** the prompt no longer appears, while any prompt user B owns is unaffected.
3. **Given** no share exists between a prompt and a user, **When** a caller attempts to revoke that nonexistent share, **Then** the operation is rejected without error side effects and no audit event is created.
4. **Given** a share on a prompt owned by user A, **When** a caller from a different organization attempts to revoke that share, **Then** the operation is rejected as if the share did not exist.

### Edge Cases

- What happens when a prompt is shared with its own owner? The operation is rejected — an owner already has access and does not need a share record.
- What happens when the prompt referenced by a share is later deprecated? The share remains valid; deprecation is a separate lifecycle flag and does not affect sharing or the accessible-prompts list.
- What happens when a user who is a member of multiple future scoping constructs (e.g. teams) is shared a prompt? Sharing and accessible-prompts resolution operate strictly at the user/organization level for this feature; no additional scoping is considered.
- What happens when two callers concurrently attempt to share the same prompt with the same user? Exactly one share record is created; the other attempt is rejected by the unique `(prompt_id, user_id)` constraint.
- What happens when a prompt is deleted while shares reference it? Out of scope for this feature — prompt deletion behavior and its effect on dependent share records is owned by whichever feature introduces prompt deletion.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist a share as a record linking exactly one prompt to exactly one user, with a creation timestamp.
- **FR-002**: System MUST enforce uniqueness on the combination of prompt and shared-with user, so the same prompt cannot be shared with the same user more than once concurrently.
- **FR-003**: System MUST reject creating a share where the shared-with user does not belong to the same organization as the prompt.
- **FR-004**: System MUST reject creating a share for a prompt that does not exist, or that does not belong to the caller's organization.
- **FR-005**: System MUST reject creating a share where the shared-with user is the prompt's own owner.
- **FR-006**: System MUST allow a caller to revoke an existing share, removing that user's shared (non-owner) access to that prompt.
- **FR-007**: System MUST reject revoking a share that does not exist, or that belongs to a prompt outside the caller's organization, without side effects.
- **FR-008**: System MUST provide a single accessible-prompts query, for a given user within a given organization, that returns exactly the prompts that user owns plus the prompts shared with that user.
- **FR-009**: System MUST exclude from a user's accessible-prompts list any prompt owned by, or shared with, a same-valued user id that belongs to a different organization.
- **FR-010**: System MUST exclude a prompt from a user's accessible-prompts list once every share granting that user access to it has been revoked, unless the user owns that prompt.
- **FR-011**: System MUST record a `PromptShared` audit event for every successful share creation, including organization, prompt, sharing user, and shared-with user identity.
- **FR-012**: System MUST record a `PromptShareRevoked` audit event for every successful share revocation, including organization, prompt, and shared-with user identity.
- **FR-013**: System MUST ensure rejected share creation or revocation operations create no share record and no audit event.
- **FR-014**: System MUST expose the accessible-prompts query as the single source of truth for prompt access checks, so that other bounded contexts and consumers (e.g. prompt expansion, listing surfaces) call into it rather than re-deriving ownership-or-shared logic themselves.

### Key Entities

- **PromptShare**: A grant of access to one prompt for one non-owner user, scoped within a single organization. Key attributes: prompt identity, shared-with user identity, and creation time. Uniqueness is enforced on the combination of prompt and user; a share is either present (access granted) or absent (no access) — it has no other state.
- **Accessible Prompt**: A read-model concept, not a stored entity — the set of prompts visible to a given user, computed as the union of prompts that user owns and prompts for which a `PromptShare` naming that user exists, always evaluated within one organization.
- **Audit Event**: A durable record for successful share mutations. This feature emits `PromptShared` and `PromptShareRevoked` through the existing audit write path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of attempts to share a prompt with a user from a different organization than the prompt are rejected, with zero share records created.
- **SC-002**: 100% of accessible-prompts list results for a user include every prompt that user owns and every prompt shared with them, and exclude every other prompt in the same organization.
- **SC-003**: 100% of accessible-prompts list results exclude prompts and shares belonging to other organizations, even when a share row coincidentally names a same-valued user id.
- **SC-004**: 100% of revoked shares are absent from the shared-with user's accessible-prompts list on the very next read, while that user's owned prompts remain fully present.
- **SC-005**: 100% of successful share creations and revocations produce their required audit event, and 100% of rejected attempts produce no audit event and no share record change.
- **SC-006**: 100% of duplicate share-creation attempts on an existing `(prompt, user)` pair are rejected with no second record created.

## Assumptions

- "Caller" means an authenticated actor already resolved to an organization and user identity by the Identity/Access bounded context; authentication, membership resolution, and organization lookup are out of scope for this feature.
- Shared-with user validation (organization membership) relies on the Identity/Access read contract and must not import Identity/Access internals, consistent with `018-prompt-version-model`.
- Any caller resolved within the prompt's organization may create or revoke a share; this feature does not restrict share creation/revocation to the prompt's owner specifically, consistent with `018-prompt-version-model`'s existing prompt lifecycle operations (deprecate, publish, rollback), none of which enforce a per-user ownership check beyond organization scope. A stricter owner-only or role-based rule can be layered on later (e.g. in Distribution's route handlers, or a future authorization feature) without changing this feature's data invariants.
- Audit events are written through the shared Audit & Compliance write path; defining that event schema and storage is out of scope for this feature.
- There is no share "role" or permission level (e.g. read vs. edit) — a share is a binary access grant, matching the ported Python `PromptShare` model.
- Prompt expansion's own "not found or not shared with you" behavior (epic 008) is out of scope for this feature; this feature only guarantees the accessible-prompts query that expansion will call into.
