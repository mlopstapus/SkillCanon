# Quickstart: Project-Scoped Governance UI

Manual validation once this feature is implemented. Assumes a local dev stack is running (`docker compose up -d` or `pnpm dev`) with at least one organization, one team, one project, and an admin session — see this repo's existing smoke-test conventions (`CLAUDE.md`) for how to get there quickly (e.g. reuse fixtures from a prior manual pass, or register → create team → create project).

## Prerequisites

- Logged in as an org-admin.
- At least one project exists (`/projects`), with no local objectives yet.

## Scenario 1 — Empty state

1. Open the project's detail page (`/projects/[id]`).
2. Click the **Governance** tab.
3. **Expect**: an empty state ("No objectives yet" or similar, via the shared `AppState` component) with a clear "New objective" call to action. No "Inherited from teams" section anywhere on the tab. No mention of policy anywhere on the tab.

## Scenario 2 — Create

1. From the Governance tab's empty state (or its header), click **New objective**.
2. Fill in a name (e.g. "Prefer opus for customer-facing output") and guidance text.
3. Submit.
4. **Expect**: the drawer closes, the new objective appears in the list immediately (no manual refresh needed), and the tab's count badge updates.
5. Open a **second** project (a different `projectId`) and confirm the objective just created does **not** appear there.
6. Open the project's owning team's own governance page (`/teams/[teamId]/objectives`) and confirm the objective does **not** appear there either (it's project-scoped, not team-scoped — no cascade).

## Scenario 3 — Edit

1. Click an existing local objective row.
2. Change its guidance text.
3. Submit.
4. **Expect**: the updated text is reflected immediately in the list.

## Scenario 4 — Delete

1. Click the remove (×) control on an existing local objective row.
2. **Expect**: it disappears from the list immediately and the count badge updates.

## Scenario 5 — Non-admin mutation is rejected, not hidden

1. Log in as a non-admin member of the project's team.
2. Open the same project's Governance tab.
3. **Expect**: the same local objectives are visible, and the "New objective" button and row edit/delete controls are present (matching this page's other tabs and the team-scoped governance page — controls are not hidden by role anywhere in this app).
4. Attempt to create, edit, or delete an objective.
5. **Expect**: the request is rejected with a clear error message shown in the drawer (server-side `assertCanManageObjective` rejection, surfaced via the drawer's existing error state) — no objective is actually created/changed/removed.

## Scenario 6 — Cross-org isolation (if a second org is available)

1. As an admin of organization A, note a project's objective.
2. As an admin of organization B, attempt to view organization A's project directly by URL (if reachable at all — should already 404/redirect per existing project-page tenant isolation, unrelated to this feature).
3. **Expect**: no behavior change from this feature — existing project-page tenant isolation already covers this; this feature adds no new exposure.

## Automated checks (run after each scenario, or instead of manually reproducing where already covered)

- `pnpm vitest run src/bcs/governance/application/list-objectives-by-project.test.ts` — new function, Testcontainers-backed (project-scoped filter, empty-array-on-no-match, cross-org isolation).
- `pnpm vitest run 'src/app/(app)/projects/[id]/project-detail-view.test.tsx'` — new tab's structural render + axe assertions.
- `pnpm typecheck && pnpm lint` — `ObjectiveDrawer`'s widened `scopeKind` union and the new `ProjectDetailData.objectives` field must type-check across every existing caller.
