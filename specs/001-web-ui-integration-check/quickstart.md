# Quickstart: Reproducing This Feature's Verification

## Environment

This audit ran against the already-running `docker compose` dev stack for this repo (`skillcanon-app-1` / `skillcanon-database-1`, remapped to `localhost:3001` / `localhost:5434` per this repo's own Multica-workspace convention — see `CLAUDE.md`). No rebuild was needed since this feature makes no `Dockerfile`/`docker-compose.yaml`/runtime-code changes beyond the one `nav-model.ts` edit, which doesn't require a container rebuild to verify (`pnpm build`/`pnpm test` cover it).

No browser-automation tool (`chromium-cli`, Playwright with installed browsers) was available in this sandboxed environment. Route existence, redirect behavior, and workflow wiring were verified by (a) live HTTP checks against the running instance and (b) direct reading of each workflow's server action / route handler to confirm it calls real `@/bcs/*` functions. A full interactive click-through was not performed — see Smoke Flow Results below for exactly how far it was verified and why.

## Protected-Route Sweep (User Story 3 / FR-011 / SC-005)

Live check, no session cookie, against every authenticated route family (including two now-known-missing ones, to confirm the shared gate still fires before any 404 rendering):

```
GET /dashboard              -> 307 -> /login
GET /prompts                -> 307 -> /login
GET /teams                  -> 307 -> /login
GET /projects                -> 307 -> /login
GET /workflows               -> 307 -> /login   (route doesn't exist, gate still fires first)
GET /metrics                 -> 307 -> /login   (route doesn't exist, gate still fires first)
GET /settings/api-keys       -> 307 -> /login
GET /settings/audit-log      -> 307 -> /login
GET /teams/x/policies        -> 307 -> /login   (route doesn't exist, gate still fires first)
```

**Result**: 100% of authenticated route families redirect to `/login` before any protected content renders, including for route paths with no matching `page.tsx` — confirming the single `(app)/layout.tsx` gate (`resolveAppShellAccess`) runs ahead of Next.js's own route/not-found resolution, so there is no way to reach protected content (or even a bare 404 shell) without a valid session. This satisfies FR-011/SC-005.

Unauthenticated public pages render correctly (not gated): `GET /login -> 200`, `GET /register -> 200`, `GET / -> 200`.

## Smoke Flow Results (User Story 4 / FR-013 / FR-014 / SC-004 / SC-006)

| Step | Reachable through UI? | Evidence |
|---|---|---|
| Create team | Yes | `(app)/teams/team-form-drawer.tsx` → `createTeamAction` (`teams/actions.ts`) → real `createTeam` from `@/bcs/identity-access`, wrapped in `withTenantContext` |
| Create project | Yes | `(app)/projects/new-project-drawer.tsx` → `createProjectAction` (`projects/actions.ts`) → real `createProject` from `@/bcs/prompt-registry` |
| Create policy | **No** | No page, drawer, or server action anywhere under `src/app/(app)` calls `createPolicy`/`createObjective`. The only callers are `src/app/api/policies/route.ts` / `src/app/api/objectives/route.ts` (REST-only). This blocks the flow from completing entirely through user-facing pages, as FR-013 requires — the underlying blocker is the same governance-views-ui gap recorded in `parity-audit.md` |
| Create prompt | Yes | `(app)/prompts/new-prompt-drawer.tsx` → `createPromptAction` (`prompts/actions.ts`) → real `createPrompt` from `@/bcs/prompt-registry` |
| Expand prompt / show applied policy | Yes (mechanically) | `(app)/prompts/[name]/page.tsx` calls the real `expand()` from `@/bcs/prompt-registry`, not mock data; `prompt-detail-view.tsx` renders `data.appliedPolicies` in the expansion result panel (`Applied policies (${count})`) — the rendering path exists and is REST-backed, satisfying FR-014/SC-006's UI contract. It cannot be exercised end-to-end with a real applied policy today only because step 3 (create policy) has no UI path yet |

**Conclusion**: 4 of 5 smoke-flow steps are reachable and REST-backed through the real UI today. The flow cannot be completed end-to-end purely through user-facing pages solely because policy creation has no UI — this is not a new finding, it is the same `005-governance/005-governance-views-ui.md` gap already open and tracked in that epic. Per FR-015, this checkpoint records the gap rather than building the governance UI here. SC-004 will pass once that epic ships its policy/objective creation drawer; nothing else in the smoke flow blocks it.
