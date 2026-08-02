# Contract: Project Usage Metrics Dashboard

This feature has no new external (customer-facing) HTTP API — it's a new tab on the existing Project Detail page, with no new route. Its "contracts" are (a) the new cross-BC function obligations, (b) the access-control contract (inherited, not modified), and (c) the UI-state contract between the computed `ProjectMetrics` and what renders.

## Access control contract (inherited, not modified)

- **Route**: `GET /projects/[id]` (existing page, existing tab bar) — no new route added.
- **Requirement**: Same as every other tab on this page today — an authenticated session, any organization member (not restricted to project members or admins). No new authorization check is introduced for the Metrics tab specifically, matching the existing Members/Prompts/Repos/Teams tabs' access model.
- **Enforcement point**: `page.tsx`'s existing `authenticateSession` + `withTenantContext` call, unchanged.

## New cross-BC function contracts

### `distribution.recordPromptUsage(db, params: RecordPromptUsageParams): Promise<void>`

1. **Insert-only, no read-your-write requirement**: callers never need the inserted row back — this function returns `void`, not the created row (no id is needed by any caller today).
2. **No audit write**: unlike every mutating function elsewhere in this codebase, this one does NOT wrap in `withAudit` — usage telemetry is explicitly distinct from the audit trail (`CONTRACT.md`'s own Purpose section). A future reviewer must not "fix" this as a missing audit call.
3. **Not called by any production code path in this feature**: per spec FR-002a, the live-preview flow must never call this. Tests call it directly to seed fixtures. This is intentional, not an oversight — any future PR wiring it into the live-preview flow directly contradicts this feature's own spec and must be rejected in review.
4. **Nullable `projectId`/`userId` accepted and stored as given**: no validation rejects a null project or user — both are valid, meaningful states (ad hoc usage; ungoverned invocation), not error conditions.

### `distribution.getPromptUsageSummaryForProject(db, organizationId, projectId, options): Promise<PromptUsageSummaryForProject>`

1. **Org- and project-scoped, always**: every internal query filters by both `organizationId` and `projectId` — a cross-org `projectId` MUST return the same empty-summary shape as a nonexistent one (never a distinguishing error, matching this codebase's established cross-org-denial-equals-not-found convention).
2. **Never throws for "no usage"**: an organization/project with zero rows returns a summary with `totalInvocations: 0` and empty arrays throughout — never an error, never `null`.
3. **`windowRows` and `dailyCountsBySkill` are pre-scoped to their respective windows** (`activeWindowDays`, `trendDays`) by the query itself — the caller (`prompt-registry`) never re-filters by date; it only ever consumes what's already correctly bounded.

### `prompt-registry.getProjectMetrics(db, organizationId, projectId): Promise<ProjectMetrics>`

1. **Coverage ratio (tile) vs. gap panel (list) are computed independently** — see `data-model.md`/`research.md`. A future change to one MUST NOT accidentally couple its logic to the other; they answer different questions ("are required skills used at all" vs. "who specifically hasn't used one").
2. **`gapMembers` and `bySkill`/`byMember` carry raw ids only** (`promptId`, `userId`) — this function never resolves a display name. The caller (`page.tsx`) owns that, using data it already fetches.
3. **Empty inputs produce empty, not missing, output**: a project with no members, no required skills, or no usage at all still returns a fully-shaped `ProjectMetrics` (zero counts, empty arrays, `coverageLabel: "—"`), never a partial object or thrown error — the UI's empty states (FR-011) depend on always receiving a complete shape to check against.

## UI state contract

The Metrics tab renders four largely independent regions, each with its own empty/populated state — matching spec FR-011 ("every tile, panel, chart, and table... a real, distinct empty state"):

| Region | Populated condition | Empty/alternate state |
|---|---|---|
| Summary tiles | Always rendered | Coverage tile shows `"—"` when `requiredSkillIds` is empty (spec Acceptance Scenario 1.3) — not `0%`, not blank |
| Gap panel | `gapMembers.length > 0` | If `allClear` (has required skills, zero gaps): all-clear message. If `requiredSkillIds.length === 0`: panel is not rendered at all (not applicable, not "no gaps") |
| Trend chart | Always rendered, 14 entries | A day with zero invocations still renders as a zero-height segment set for that day (spec Acceptance Scenario 3.2) — the day is never omitted from the x-axis |
| By-skill table | `bySkill.length > 0` | "No skills curated for this project yet" empty state (matches existing `bySkillEmpty` mockup copy) |
| By-member table | `byMember.length > 0` | Empty state, distinct from the by-skill table's | 

No region ever falls back to sample/placeholder data under any circumstance (spec FR-011, SC-005) — every empty state is a real, empty-data UI branch, never a hidden default dataset.
