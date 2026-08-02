# Quickstart: Project Usage Metrics Dashboard

This is a validation guide, not implementation — it proves the feature end-to-end once built. Full behavior details live in `data-model.md`, `contracts/`, and `spec.md`; this only sequences the calls. Since no genuine (non-test) caller of `expand()` exists yet anywhere in this codebase (spec Clarifications), every scenario below seeds usage via `recordPromptUsage` directly, exactly as this feature's own tests do.

## Prerequisites

- `pnpm install`
- A running Postgres (Testcontainers spins one up automatically for the test suite — no manual setup needed for automated validation)
- Migration applied: `distribution.prompt_usage` exists (via `pnpm db:migrate` once this feature's migration is generated)
- An existing project, some project members, and a required/optional skill assignment (fixtures — see `022-project-skill-assignment`'s own quickstart for how those are set up)

## Scenario 1 — Empty project shows the correct empty state

```ts
import { getProjectMetrics } from "@/bcs/prompt-registry";

const metrics = await getProjectMetrics(db, organizationId, project.id);
// metrics.totalInvocations === 0
// metrics.bySkill === [] and metrics.byMember === []
// metrics.coverageLabel === "—" if no required skills, or "0/N" if required skills exist but none used
// metrics.trend has 14 entries, every countsByPromptId empty
```

**Expected outcome**: a brand-new project (or any project before real usage exists) renders every tile/panel/table's real empty state — never placeholder data (spec FR-011, SC-005).

## Scenario 2 — Seed usage, verify tiles and by-skill/by-member tables

```ts
import { recordPromptUsage } from "@/bcs/distribution";
import { getProjectMetrics } from "@/bcs/prompt-registry";

await recordPromptUsage(db, { organizationId, promptId: skillA.id, promptVersionId: skillA.activeVersionId, projectId: project.id, userId: memberA.userId });
await recordPromptUsage(db, { organizationId, promptId: skillA.id, promptVersionId: skillA.activeVersionId, projectId: project.id, userId: memberB.userId });
await recordPromptUsage(db, { organizationId, promptId: skillB.id, promptVersionId: skillB.activeVersionId, projectId: project.id, userId: null }); // ungoverned

const metrics = await getProjectMetrics(db, organizationId, project.id);
// metrics.totalInvocations === 3
// metrics.activeSkillCount === 2, metrics.activeContributorCount === 2 (null userId excluded)
// metrics.bySkill has 2 rows (skillA: runCount 2, skillB: runCount 1)
// metrics.byMember has 3 rows: memberA (1), memberB (1), and a null-userId "no user" bucket (1)
```

**Expected outcome**: recorded usage flows through to every tile and table correctly, with the unattributed invocation grouped into its own bucket rather than dropped or misattributed (spec Edge Cases).

## Scenario 3 — Required-skill coverage tile vs. gap panel are independent

```ts
// skillA is "required", skillB is "optional" (via assignSkillToProject — see 022's quickstart)
// From Scenario 2: skillA was used by memberA and memberB; skillB was used, but not by any specific member (null userId)

const metrics = await getProjectMetrics(db, organizationId, project.id);
// metrics.coverageLabel === "1/1" — the only required skill (skillA) was used by *someone* within the window
// metrics.gapMembers === [] — every actual project member (memberA, memberB) has used the required skill
// metrics.allClear === true
```

Now add a third project member who has used nothing:

```ts
import { addProjectMember } from "@/bcs/prompt-registry";
await addProjectMember(db, actorAdmin, { projectId: project.id, userId: memberC.userId });

const metricsAfter = await getProjectMetrics(db, organizationId, project.id);
// metricsAfter.coverageLabel === "1/1" — UNCHANGED, this tile only cares whether the skill was used by anyone
// metricsAfter.gapMembers === [{ userId: memberC.userId, missingSkillIds: [skillA.id] }]
// metricsAfter.allClear === false
```

**Expected outcome**: adding an inactive member changes the gap panel but not the coverage tile — proving the two are genuinely independent computations, not the same value shown twice (research.md's coverage-tile-vs-gap-panel decision).

## Scenario 4 — Live-preview flow never produces a usage row

```ts
import { expand } from "@/bcs/prompt-registry";

// Calling expand() directly (the live-preview page's own call path) must NOT
// result in any new prompt_usage row — there is no code path from here into
// recordPromptUsage today (spec FR-002a).
const before = await getProjectMetrics(db, organizationId, project.id);
await expand(db, { organizationId, promptName: skillA.name, input: {}, userId: memberA.userId, projectId: project.id });
const after = await getProjectMetrics(db, organizationId, project.id);
// after.totalInvocations === before.totalInvocations — unchanged
```

**Expected outcome**: proves the Clarifications decision by construction — `expand()` and `recordPromptUsage` remain entirely disconnected in this feature.

## Running the real test suite

```bash
pnpm vitest run src/bcs/distribution
pnpm vitest run src/bcs/prompt-registry
pnpm vitest run "src/app/(app)/projects"
```

Expect this feature's new files (`record-prompt-usage.test.ts`, `get-prompt-usage-summary-for-project.test.ts`, `get-project-metrics.test.ts`, extended `project-detail-view.test.tsx`, new `project-metrics-trend-chart.test.tsx`) to pass — Testcontainers-backed for the DB-touching tests, `renderToStaticMarkup`-only for the UI tests, no manual setup required.
