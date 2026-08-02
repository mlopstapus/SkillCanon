# Data Model: REST API Core Routes

No new database entities or migrations — every entity below already exists in `identity-access`/`governance`/`prompt-registry`'s own `domain`/`infrastructure` layers (see each BC's `CONTRACT.md`). This document defines the two things this feature *does* add: (1) the REST response shape for each resource (a thin JSON projection of the BC's already-exported summary type — no new fields invented), and (2) the complete error-class → REST-error-code → HTTP-status registry `src/shared/api/errors.ts` implements (research.md's error-mapper decision).

## REST error envelope

Every non-2xx response (mapped or unhandled) has this exact shape (FR-012):

```json
{ "error": { "code": "STRING_CONSTANT", "message": "human-readable", "details": { "...": "optional, present only for validation failures" } } }
```

- `code`: stable, machine-readable, `SCREAMING_SNAKE_CASE`. `UNAUTHENTICATED` (401, no matching credential), `VALIDATION_FAILED` (422, Zod-caught wire-input failure — `details.fieldErrors` from `.flatten()`), `INTERNAL_ERROR` (500, unhandled/unrecognized), or one of the registry codes below (each 1:1 with one BC error class).
- `details`: present only where the underlying error class or Zod carries field-level information; omitted (not `null`) otherwise.

## Error registry (`src/shared/api/errors.ts`)

Every entry below is an existing `extends Error` class already exported from its BC's barrel — registering it here requires **zero changes to the class itself**. Only error classes reachable from a BC function this feature's routes actually call are registered; any other/unregistered thrown value falls through to the `500 INTERNAL_ERROR` fallback (logged, never leaked).

### Identity & Access

| Error class | Code | Status |
|---|---|---|
| `CrossOrgReparentError` | `CROSS_ORG_REPARENT` | 404 |
| `CycleError` | `TEAM_HIERARCHY_CYCLE` | 422 |
| `DuplicateTeamSlugError` | `TEAM_SLUG_CONFLICT` | 409 |
| `DuplicateUserError` | `USER_CONFLICT` | 409 |
| `InvalidTeamAssignmentError` | `INVALID_TEAM_ASSIGNMENT` | 422 |
| `WeakPasswordError` | `WEAK_PASSWORD` | 422 |
| `LastActiveAdminError` | `LAST_ACTIVE_ADMIN` | 409 |
| `NotAuthorizedError` | `NOT_AUTHORIZED` | 403 |
| `CrossOrgUserAccessError` | `CROSS_ORG_USER_ACCESS` | 404 |
| `EntitlementRequiredError` | `ENTITLEMENT_REQUIRED` | 403 |
| `NoScopesSelectedError` | `API_KEY_NO_SCOPES` | 422 |
| `InvalidScopeError` | `API_KEY_INVALID_SCOPE` | 422 |
| `ScopeExceedsPermissionsError` | `API_KEY_SCOPE_EXCEEDS_ROLE` | 422 |
| `ApiKeyNotFoundError` | `API_KEY_NOT_FOUND` | 404 |

### Governance

| Error class | Code | Status |
|---|---|---|
| `InvalidPolicyScopeError` | `INVALID_POLICY_SCOPE` | 422 |
| `PolicyScopeNotFoundError` | `POLICY_SCOPE_NOT_FOUND` | 404 |
| `PolicyNotFoundError` | `POLICY_NOT_FOUND` | 404 |
| `InvalidObjectiveInputError` | `INVALID_OBJECTIVE_INPUT` | 422 |
| `ObjectiveScopeNotFoundError` | `OBJECTIVE_SCOPE_NOT_FOUND` | 404 |
| `ObjectiveParentNotFoundError` | `OBJECTIVE_PARENT_NOT_FOUND` | 404 |
| `ObjectiveCycleError` | `OBJECTIVE_HIERARCHY_CYCLE` | 422 |
| `ObjectiveNotFoundError` | `OBJECTIVE_NOT_FOUND` | 404 |

### Prompt Registry

| Error class | Code | Status |
|---|---|---|
| `DuplicateProjectNameError` | `PROJECT_NAME_CONFLICT` | 409 |
| `DuplicateProjectSlugError` | `PROJECT_SLUG_CONFLICT` | 409 |
| `ProjectNotFoundError` | `PROJECT_NOT_FOUND` | 404 |
| `ProjectOrganizationNotFoundError` | `PROJECT_ORGANIZATION_NOT_FOUND` | 404 |
| `ProjectUserNotFoundError` | `PROJECT_USER_NOT_FOUND` | 404 |
| `ProjectTeamNotFoundError` | `PROJECT_TEAM_NOT_FOUND` | 404 |
| `DuplicateProjectMemberError` | `PROJECT_MEMBER_CONFLICT` | 409 |
| `ProjectMemberNotFoundError` | `PROJECT_MEMBER_NOT_FOUND` | 404 |
| `DuplicateCollaboratorTeamError` | `COLLABORATOR_TEAM_CONFLICT` | 409 |
| `CollaboratorTeamNotFoundError` | `COLLABORATOR_TEAM_NOT_FOUND` | 404 |
| `OwnerTeamCannotBeCollaboratorError` | `OWNER_TEAM_CANNOT_BE_COLLABORATOR` | 422 |
| `ProjectTeamOrgMismatchError` | `PROJECT_TEAM_ORG_MISMATCH` | 404 |
| `DuplicateProjectRepoError` | `PROJECT_REPO_CONFLICT` | 409 |
| `ProjectRepoNotFoundError` | `PROJECT_REPO_NOT_FOUND` | 404 |
| `PromptNotFoundError` | `SKILL_NOT_FOUND` | 404 |
| `DuplicatePromptNameError` | `SKILL_NAME_CONFLICT` | 409 |
| `DuplicatePromptVersionError` | `SKILL_VERSION_CONFLICT` | 409 |
| `PromptVersionNotFoundError` | `SKILL_VERSION_NOT_FOUND` | 404 |
| `InvalidVersionShapeError` | `INVALID_SKILL_VERSION_SHAPE` | 422 |
| `ExpansionSourceNotFoundError` | `SKILL_EXPANSION_SOURCE_NOT_FOUND` | 404 |
| `SourceSkillNotFoundError` | `SKILL_NOT_FOUND` | 404 |
| `SubscriptionNotFoundError` | `SUBSCRIPTION_NOT_FOUND` | 404 |
| `DuplicateSubscriptionError` | `SUBSCRIPTION_CONFLICT` | 409 |
| `CrossOrgSubscriberError` | `CROSS_ORG_SUBSCRIBER` | 404 |
| `CannotSubscribeToOwnSkillError` | `CANNOT_SUBSCRIBE_OWN_SKILL` | 422 |
| `CannotForkOwnSkillError` | `CANNOT_FORK_OWN_SKILL` | 422 |
| `SubscriberNotAuthorizedError` | `SUBSCRIBER_NOT_AUTHORIZED` | 403 |
| `DuplicateProjectSkillAssignmentError` | `PROJECT_SKILL_ASSIGNMENT_CONFLICT` | 409 |
| `ProjectSkillAssignmentNotFoundError` | `PROJECT_SKILL_ASSIGNMENT_NOT_FOUND` | 404 |
| `PersonalSkillNotAssignableError` | `PERSONAL_SKILL_NOT_ASSIGNABLE` | 422 |
| `SkillNotEligibleForProjectError` | `SKILL_NOT_ELIGIBLE_FOR_PROJECT` | 422 |
| `InvalidChainDependencyError` | `INVALID_CHAIN_DEPENDENCY` | 422 |
| `ChainStepResolutionFailedError` | `CHAIN_STEP_RESOLUTION_FAILED` | 422 |
| `RunNotFoundError` | `CHAIN_RUN_NOT_FOUND` | 404 |
| `RunAlreadyFinishedError` | `CHAIN_RUN_ALREADY_FINISHED` | 409 |
| `RunStepConflictError` | `CHAIN_RUN_STEP_CONFLICT` | 409 |
| `NotAChainVersionError` | `NOT_A_CHAIN_VERSION` | 422 |
| `ReportOutputTooLargeError` | `CHAIN_STEP_OUTPUT_TOO_LARGE` | 422 |

**Two same-code entries are intentional**: `PromptNotFoundError` and `SourceSkillNotFoundError` both map to `SKILL_NOT_FOUND` — both mean "this skill id/name doesn't resolve for this caller," just thrown from different call paths (`getPrompt`-style lookups vs. subscribe/fork's source-skill lookup); giving callers one code for one observable failure (FR-012) matters more than preserving which internal function happened to throw.

## REST resource shapes

Each shape is the JSON projection of the BC's own exported summary type — field names unchanged (`camelCase`, matching the TypeScript source; no snake_case translation, since "equivalent behavior, not literal legacy shape" is the spec's explicit assumption).

- **Team**: `{ id, organizationId, name, slug, parentTeamId, ownerId }` — from `Team`.
- **User**: `{ id, orgId, teamId, role, email, displayName? }` — from `UserSummary`/`AppSessionUser`; `passwordHash` never included (BC types already omit it).
- **ApiKey (list/create response)**: `{ id, name, scopes, createdAt, expiresAt, lastUsedAt }` on list; create additionally returns `{ rawKey }` **once**, never persisted or returned again — matches `createApiKey`'s own one-time-reveal contract.
- **Project**: `{ id, orgId, teamId, leadUserId, name, slug, description, createdAt, updatedAt }`.
- **ProjectMember**: `{ id, projectId, userId, role, createdAt }`.
- **ProjectTeam** (collaborator): `{ id, projectId, teamId, createdAt }`.
- **ProjectRepo**: `{ id, projectId, name, url, branch, createdAt }`.
- **ProjectSkillAssignment**: `{ id, orgId, projectId, skillId, requirement, createdAt }`.
- **ProjectMetrics**: passthrough of `getProjectMetrics`'s return shape (composed usage/member/skill data — opaque to this feature, not re-shaped).
- **Skill (Prompt)**: `{ id, orgId, name, description, isDeprecated, ownerType, ownerId, forkedFromSkillId, latestVersion: { version, tags } | null }` — from `PromptSummary`.
- **Skill Version**: passthrough of `PromptVersionSummary` (`id, promptId, version, kind, systemTemplate, userTemplate, steps, createdAt`).
- **Subscription**: `{ id, orgId, sourceSkillId, subscriberType, subscriberId, createdAt }`.
- **ExpansionResult**: `{ systemMessage, userMessage, appliedPolicies, objectives }` — passthrough of `expand()`'s return.
- **ChainStepResolution**: `{ stepId, stepIndex, promptName, promptVersion, systemMessage, userMessage }`.
- **StartRunResult**: `{ runId, step: ChainStepResolution } | { runId, done: true }`.
- **AdvanceRunResult**: `{ step: ChainStepResolution } | { done: true }`.
- **ChainRunSummary**: passthrough of `getSkillChainRun`/`listSkillChainRuns`'s return shape.
- **Policy**: `{ id, orgId, teamId, name, enforcementType, content, priority, isActive, isInherited }`.
- **Objective**: `{ id, orgId, teamId, projectId, userId, title, description, parentObjectiveId, status, isInherited }`.
- **List envelope** (paginated resources only — skills, teams, projects, users, per FR-015): `{ items: T[], page, pageSize, total }`.
- **List envelope** (non-paginated collections — members, subscriptions, versions, effective policies/objectives, etc.): a bare JSON array `T[]`.
