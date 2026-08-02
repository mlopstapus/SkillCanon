# Phase 1 Data Model: Project Usage Metrics Dashboard

## New table: `distribution.prompt_usage`

First table in the `distribution` schema (the `distributionSchema` Drizzle object already exists in `shared/db/schemas.ts`, unused until now).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid, PK | no | `id()` helper, default random |
| `organization_id` | uuid | no | `organizationId()` helper — no cross-schema FK, matching this repo's established convention (no `organization_id` column anywhere carries a Drizzle `.references()`) |
| `prompt_id` | uuid | no | Opaque reference to `prompt_registry.prompts.id` — no FK (cross-schema, same convention) |
| `prompt_version_id` | uuid | no | Opaque reference to `prompt_registry.prompt_versions.id` — no FK |
| `project_id` | uuid | **yes** | Opaque reference to `prompt_registry.projects.id`. Null = ad hoc/personal expansion (spec FR-002) |
| `user_id` | uuid | **yes** | Opaque reference to `identity_access.users.id`. Null = ungoverned invocation, no acting user |
| `created_at` | timestamptz | no | `defaultNow()`. No `updated_at` — this is an immutable, append-only log; a row is never modified after insert |

Indexes:
- `(project_id, created_at)` — every project-scoped query filters and often orders by this pair
- `(project_id, prompt_id)` — powers `listGroupedBySkillForProject`
- `(project_id, user_id)` — powers `listGroupedByMemberForProject` and gap computation

No Postgres RLS on this table (see plan.md Complexity Tracking) — every query below takes `organizationId` explicitly and filters by it; this is the sole current tenant-isolation control.

Deliberately diverges from `008-distribution/004-usage-telemetry.md`'s originally-planned columns (`prompt_name`/`prompt_version` strings, `status_code`, `latency_ms`) — see plan.md Complexity Tracking item 1 and the forward-reference note already added to that backlog item.

## Domain types (`src/bcs/distribution/domain/prompt-usage.ts`)

```ts
export interface RecordPromptUsageParams {
  organizationId: string;
  promptId: string;
  promptVersionId: string;
  projectId?: string | null;
  userId?: string | null;
}

export interface PromptUsageSummaryForProject {
  totalInvocations: number; // all-time
  windowRows: Array<{ promptId: string; userId: string | null; createdAt: Date }>; // within activeWindowDays
  bySkill: Array<{ promptId: string; runCount: number; lastUsedAt: Date }>; // all-time, GROUP BY prompt_id
  byMember: Array<{ userId: string | null; runCount: number; lastActiveAt: Date }>; // all-time, GROUP BY user_id (null = "no user" bucket)
  dailyCountsBySkill: Array<{ day: string; promptId: string; count: number }>; // within trendDays, GROUP BY day, prompt_id
}

export interface GetPromptUsageSummaryForProjectOptions {
  activeWindowDays: number; // 30, per Clarifications
  trendDays: number; // 14, per spec FR-007
}
```

## `distribution`'s exposed API additions

| Function | Signature | Description |
|---|---|---|
| `recordPromptUsage` | `(db, params: RecordPromptUsageParams) => Promise<void>` | Inserts one row. No audit write (telemetry, not the audit trail — see `CONTRACT.md`). Not called by any production code path yet (spec FR-002a) — used directly by tests to seed fixtures. |
| `getPromptUsageSummaryForProject` | `(db, organizationId: string, projectId: string, options: GetPromptUsageSummaryForProjectOptions) => Promise<PromptUsageSummaryForProject>` | The one composed read `prompt-registry` calls. Every internal query scoped by both `organizationId` and `projectId`. |

## `prompt-registry`'s new composition: `getProjectMetrics`

```ts
export interface ProjectMetrics {
  totalInvocations: number;
  activeSkillCount: number; // distinct promptId in windowRows
  activeContributorCount: number; // distinct non-null userId in windowRows
  requiredSkillIds: string[];
  coverageLabel: string; // e.g. "1/2", or "—" when requiredSkillIds is empty — SKILL-level ratio (see research.md)
  hasCoverageGap: boolean; // requiredSkillIds.length > 0 && usedRequiredSkillIds.size < requiredSkillIds.length
  gapMembers: Array<{ userId: string; missingSkillIds: string[] }>; // MEMBER-level (see research.md)
  allClear: boolean; // requiredSkillIds.length > 0 && gapMembers.length === 0
  bySkill: Array<{ promptId: string; requirement: "required" | "optional" | null; runCount: number; lastUsedAt: Date }>;
  byMember: Array<{ userId: string | null; runCount: number; lastActiveAt: Date }>;
  trend: Array<{ day: string; countsByPromptId: Record<string, number> }>; // 14 entries, zero-filled
}
```

`getProjectMetrics(db, organizationId: string, projectId: string): Promise<ProjectMetrics>`:

1. Calls `distribution.getPromptUsageSummaryForProject(db, organizationId, projectId, { activeWindowDays: 30, trendDays: 14 })`.
2. Calls existing `listProjectMembers(db, organizationId, projectId)`.
3. Calls existing `listProjectSkillAssignmentsForOrganization(db, organizationId)`, filters to this `projectId` (matching `page.tsx`'s existing pattern), splits into `requiredSkillIds`/full assignment map.
4. Computes `activeSkillCount`/`activeContributorCount` from `windowRows` (distinct `promptId`; distinct non-null `userId`).
5. Computes `usedRequiredSkillIds` = distinct `promptId` in `windowRows` where `requiredSkillIds.includes(promptId)` → drives `coverageLabel`/`hasCoverageGap` (skill-level).
6. For each project member: `usedByThisMember` = distinct `promptId` in `windowRows` where `userId === member.userId` and `requiredSkillIds.includes(promptId)`; `missingSkillIds = requiredSkillIds - usedByThisMember`. Member appears in `gapMembers` iff `requiredSkillIds.length > 0 && missingSkillIds.length > 0` (member-level).
7. `trend`: for each of the 14 days in `dailyCountsBySkill`'s range (zero-filled for days with no rows at all), builds `countsByPromptId` from matching entries.
8. `bySkill`/`byMember` pass through the summary's grouped results, joining `requirement` from the assignment map for `bySkill`.

No new domain errors — this is a pure read with no validation branch (a project with no members/no assignments/no usage simply produces empty arrays and zero counts, which the UI renders as its own empty states per spec FR-011).

## UI data shape (`ProjectDetailData` extension)

`page.tsx` calls `getProjectMetrics` alongside its existing `Promise.all`, then maps `ProjectMetrics`' raw ids to display labels using data it already fetches (`allUsers` → `userNameById`, the existing skill/prompt list → name lookup), producing a `metrics: ProjectMetricsView` field on `ProjectDetailData` with names already resolved — mirroring exactly how `requiredPrompts`/`optionalPrompts`/`members` are already resolved today. No new cross-BC call is introduced in `page.tsx` beyond `getProjectMetrics` itself.
