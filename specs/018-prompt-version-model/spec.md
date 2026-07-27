# Feature Specification: Prompt & Version Model

**Feature Branch**: `018-prompt-version-model`

**Created**: 2026-07-27

**Status**: Clarified

**Input**: User description: "Prompt & Version Model (epic 006-prompt-registry, backlog item backlog/006-prompt-registry/002-prompt-and-version-model.md). Port Prompt and PromptVersion from the current Python models.py/prompt_service.py into the new prompt-registry bounded context. Correct prompt name uniqueness from global to organization-scoped, persist immutable prompt versions, support prompt CRUD, version publication, deprecation, org-scoped list/get by name, version listing, and rollback by repointing active_version_id without editing or deleting any PromptVersion row. Every mutation must produce the expected audit event and the feature depends on Identity/Access plus the Prompt Registry contract."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and read organization-scoped prompts (Priority: P1)

An authenticated caller creates a named prompt in their organization, optionally assigns an owner user, and later retrieves or lists that prompt by name without colliding with prompts in other organizations.

**Why this priority**: Prompt identity and tenant isolation are the foundation for every downstream prompt registry workflow. If names are still globally unique, organizations cannot independently use common prompt names like `commit`.

**Independent Test**: Can be fully tested by creating prompts named `commit` in two different organizations, confirming both succeed, then attempting a second `commit` prompt in one organization and confirming it is rejected.

**Acceptance Scenarios**:

1. **Given** organization A has no prompt named `commit`, **When** a caller in organization A creates a prompt named `commit`, **Then** the prompt is created with organization A ownership, optional description and owner user, active status, timestamps, and a `PromptCreated` audit event.
2. **Given** organization A and organization B each have authenticated callers, **When** both organizations create a prompt named `commit`, **Then** both prompts exist independently with no cross-organization conflict.
3. **Given** organization A already has a prompt named `commit`, **When** a caller in organization A attempts to create another prompt named `commit`, **Then** the request is rejected and no prompt or audit event is created.
4. **Given** organization A has a prompt named `commit`, **When** a caller in organization B gets or lists prompts by name, **Then** organization A's prompt is never returned to organization B.

---

### User Story 2 - Publish immutable prompt versions (Priority: P2)

A caller publishes new versions for an existing prompt, preserving every version's templates, input schema, tags, and creation time exactly as they were first published.

**Why this priority**: Prompt expansion must be reproducible against a specific version forever. Updating a version in place would break expansion reproducibility and downstream auditability.

**Independent Test**: Can be fully tested by creating a prompt, publishing two versions, confirming the active version advances to the latest published version, and confirming there is no application operation that changes an existing version's content after creation.

**Acceptance Scenarios**:

1. **Given** an existing prompt in organization A, **When** a caller publishes version `1`, **Then** a prompt version is created with its system template, user template, input schema, tags, and creation time, the prompt's active version points to version `1`, and a `PromptVersionPublished` audit event is recorded.
2. **Given** an existing prompt with version `1`, **When** a caller publishes version `2`, **Then** version `1` remains unchanged, version `2` is created as a separate record, the active version points to version `2`, and a `PromptVersionPublished` audit event is recorded.
3. **Given** any existing prompt version, **When** application service capabilities are inspected or exercised, **Then** no update path exists that can modify that version's templates, schema, tags, version identifier, or creation time.

---

### User Story 3 - Manage prompt lifecycle and rollback active version (Priority: P3)

A caller deprecates prompts, lists available versions, and rolls a prompt back to a previously-published version by changing which version is active without altering version history.

**Why this priority**: Operators need lifecycle controls after prompts and versions exist. Rollback restores prior behavior quickly while retaining newer versions for history and future reactivation.

**Independent Test**: Can be fully tested by publishing multiple versions, rolling back to an older one, confirming only the prompt's active version pointer changed, then confirming version listing still returns all versions unchanged.

**Acceptance Scenarios**:

1. **Given** a prompt with multiple versions, **When** a caller lists versions, **Then** every published version for that prompt is returned without exposing versions from prompts in other organizations.
2. **Given** a prompt whose active version is version `3`, **When** a caller rolls back to version `1`, **Then** the prompt's active version points to version `1`, version `1` remains unchanged, and versions `2` and `3` remain present and unchanged.
3. **Given** a prompt in organization A, **When** a caller deprecates it, **Then** the prompt is marked deprecated within organization A and no prompt in another organization is affected.
4. **Given** a prompt in organization A, **When** a caller in organization B attempts to deprecate it, publish a version for it, list its versions, or roll it back, **Then** the operation is rejected as if the prompt did not exist.

### Edge Cases

- What happens when a prompt creation supplies an owner user from another organization? The operation is rejected and no prompt or audit event is created.
- What happens when a caller publishes a version for a deprecated prompt? Publishing remains allowed for an otherwise-valid prompt; deprecation is a prompt lifecycle flag for consumers and does not mutate or lock version history in this feature.
- What happens when rollback targets a version number that was never published for that prompt? The rollback is rejected and the current active version remains unchanged.
- What happens when rollback targets a version from another prompt, including a prompt with the same name in another organization? The rollback is rejected and no prompt state changes.
- What happens when a prompt has no active version yet? Get/list prompt metadata may return the prompt with no active version; expansion behavior is outside this feature and belongs to the later expansion-engine feature.
- What happens when two callers concurrently try to create the same prompt name in the same organization? Exactly one create succeeds and the other is rejected by the organization-scoped uniqueness rule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist prompts with organization identity, name, optional description, deprecation state, optional active version reference, optional owner user, and creation/update timestamps.
- **FR-002**: System MUST enforce prompt name uniqueness within an organization.
- **FR-003**: System MUST allow different organizations to use the same prompt name without conflict.
- **FR-004**: System MUST reject a prompt owner user that does not belong to the prompt's organization.
- **FR-005**: System MUST allow callers to create prompts only in the caller's organization.
- **FR-006**: System MUST allow callers to get a prompt by name within the caller's organization.
- **FR-007**: System MUST allow callers to list prompts visible in the caller's organization without returning prompts from other organizations.
- **FR-008**: System MUST allow callers to mark a prompt in their organization as deprecated.
- **FR-009**: System MUST treat prompts from other organizations as inaccessible for create conflict checks, get, list, deprecate, publish, version list, and rollback operations.
- **FR-010**: System MUST persist prompt versions with prompt identity, version identifier, optional system template, optional user template, input schema, tags, and creation timestamp.
- **FR-011**: System MUST create prompt versions only by publishing new versions; the application service MUST NOT expose any operation that updates an existing prompt version's templates, schema, tags, version identifier, or creation timestamp.
- **FR-012**: System MUST update a prompt's active version reference when a new version is published for that prompt.
- **FR-013**: System MUST allow callers to list all versions for a prompt in their organization.
- **FR-014**: System MUST allow callers to roll back a prompt by repointing the prompt's active version reference to an already-published version for that same prompt.
- **FR-015**: System MUST NOT edit, delete, or otherwise alter any prompt version record during rollback.
- **FR-016**: System MUST reject rollback to a nonexistent version or to a version belonging to a different prompt.
- **FR-017**: System MUST allow version publication for an otherwise-valid deprecated prompt unless a later feature explicitly changes deprecation write semantics.
- **FR-018**: System MUST record a `PromptCreated` audit event for every successful prompt creation, including organization, prompt, and acting user identity.
- **FR-019**: System MUST record a `PromptVersionPublished` audit event for every successful version publication, including organization, prompt, version, and acting user identity.
- **FR-020**: System MUST ensure rejected operations create no prompt, version, active-version change, deprecation change, or audit event.

### Key Entities

- **Prompt**: A named prompt definition owned by exactly one organization. Key attributes: organization identity, name, description, deprecated/not deprecated state, optional active version reference, optional owner user, and timestamps. Name uniqueness is scoped to the organization, not global.
- **PromptVersion**: An immutable published version of one prompt. Key attributes: prompt identity, version identifier, optional system template, optional user template, input schema, tags, and creation time. It can be created but not modified by application services after publication.
- **Audit Event**: A durable record for successful prompt mutations. This feature emits `PromptCreated` and `PromptVersionPublished` through the existing audit write path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of same-name prompt create attempts across two different organizations succeed independently when each organization has no existing prompt with that name.
- **SC-002**: 100% of duplicate prompt name create attempts within the same organization are rejected with no second prompt persisted.
- **SC-003**: A full prompt-version immutability test pass finds zero application service operations capable of updating an existing prompt version after creation.
- **SC-004**: 100% of rollback tests show only the prompt's active version reference changing; all prompt version records before and after rollback remain byte-for-byte unchanged.
- **SC-005**: 100% of successful prompt creation and version publication mutations produce their required audit events, and 100% of rejected mutations produce no audit event.
- **SC-006**: Cross-organization access tests for get/list/deprecate/publish/version-list/rollback return zero prompts or versions from another organization.

## Assumptions

- "Caller" means an authenticated actor already resolved to an organization and user identity by the Identity/Access bounded context; authentication, membership resolution, and organization lookup are out of scope for this feature.
- Owner user validation relies on the Identity/Access read contract and must not import Identity/Access internals.
- Audit events are written through the shared Audit & Compliance write path; defining that event schema and storage is out of scope for this feature.
- Prompt expansion behavior is out of scope for this feature, but version immutability is required because the later expansion engine must reproduce output for a specific prompt version forever.
- Prompt sharing is out of scope for this feature and is covered by the next Prompt Registry feature.
- Rollback changes the prompt lifecycle state by selecting a different active version; it is not a new version publication and does not emit `PromptVersionPublished`. The current Prompt Registry contract only names prompt/version audit events for creation and publication in this feature.
