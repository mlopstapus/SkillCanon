# Legacy → Rebuilt UI Parity Audit (Re-Verification)

Source: `legacy/frontend/src/app/**` vs. `src/app/(app)/**` + `src/app/(auth)/**` + `src/app/api/**`,
re-verified 2026-08-09/10 by direct file inspection *and* live browser/REST verification against
the running self-hosted instance (`spechub-app-1`/`spechub-database-1`). Supersedes the prior pass
recorded in `specs/001-web-ui-integration-check/parity-audit.md` (2026-08-03).

## Live-blocking issue found and fixed during this audit

**Not a UI/parity gap — an environment drift issue.** While live-verifying the Prompts row below,
`/prompts/release-workflow` 500'd with `relation "prompt_registry.prompt_version_files" does not
exist`. Root cause: the shared dev database (`spechub-database-1`) had only 27 of 30 committed
Drizzle migrations applied (`drizzle.__drizzle_migrations` max id 27; `drizzle/migrations/meta/_journal.json`
has entries through idx 29 / `0029_audit_compliance_rls`). This silently broke **every** prompt
detail page (any page reading `promptVersionFiles`) and, downstream, the Projects list (0 shown
instead of the real 1) for any RLS/schema-dependent join added in the missing migrations. Fixed
non-destructively via `MIGRATION_DATABASE_URL=... pnpm db:migrate` (idempotent, no data loss;
confirmed `__drizzle_migrations` count went 27 → 30 and both symptoms cleared immediately after).
No application source code changed — this was purely the shared dev stack's data/migration state
falling behind committed code, a known class of issue this repo's own CLAUDE.md already documents
extensively for the "stale local Postgres volume" case. Recorded here per FR-008/FR-009 as a real
gap found and fixed during this audit, distinct from a UI composition/parity gap.

## Shell composition (User Story 1)

Live-confirmed clean, matching `research.md` §1's static findings:

- All 8 nav entries (Overview, Prompts, Governance, Teams, Projects, Metrics, API keys, Audit log)
  render inside the same `AppShell`/`AppNavigation` chrome with correct active-state highlighting.
- Direct URL visits to `teams/[teamId]/objectives` and a project's Governance tab also render
  inside the same shell — no standalone chrome anywhere.
- No dead nav entry, no second sidebar/header, no competing auth gate found. **No fix needed.**

## Route-family parity matrix

| Legacy route family | Legacy path(s) | Classification | Rebuilt destination / rationale | Owner |
|---|---|---|---|---|
| Welcome / root | `page.tsx`, `welcome/page.tsx` | Rebuilt | `src/app/page.tsx` + `(auth)/welcome` | `004-app-shell-and-landing` |
| Login / register / invite | `login`, `register`, `invite/[token]` | Rebuilt | `(auth)/login`, `(auth)/register`, `(auth)/invite/[token]` | `002-identity-access` |
| Settings — API keys | `settings/page.tsx` | Rebuilt | `(app)/settings/api-keys` — live-verified: issued a real key (`audit-035-chain-run-key`), scope checkbox, one-time reveal all worked | `002-identity-access` |
| Settings — audit log | *(none in legacy)* | Rebuilt (additive) | `(app)/settings/audit-log` | `003-audit-compliance` |
| Teams — membership | `teams/page.tsx` (membership half) | Rebuilt | `(app)/teams` | `002-identity-access` |
| Teams — policy/objective CRUD | `teams/page.tsx` (inline policy/objective CRUD) | **Rebuilt — previously the blocker, now closed and live-verified** | `(app)/teams/[teamId]/policies` + `.../objectives` — live-verified: created policy `audit-035-no-secrets` via the real UI, appeared immediately in the scope tree and in a skill's Applied Policies | `005-governance` (`005-governance-views-ui`, `006-project-scoped-governance-ui`, both archived) |
| Projects | `projects/page.tsx`, `projects/[id]/page.tsx` | Rebuilt | `(app)/projects`, `(app)/projects/[id]` — live-verified: created project "UI Final Audit 035" via the real drawer, appeared immediately in the list | `006-prompt-registry` |
| Prompts (skills) | `prompts/page.tsx`, `prompts/[name]/page.tsx`, `prompts/new`, `prompts/[name]/new-version` | Rebuilt (replaced — drawers replace the two standalone legacy routes) | `(app)/prompts`, `(app)/prompts/[name]` — live-verified: created skill `audit-035-prompt`, published a v1 template version, Preview tab showed both applicable policies appended correctly | `006-prompt-registry` |
| Workflows (chain-kind skills) | `workflows/page.tsx`, `workflows/new`, `workflows/[id]` | **Rebuilt (replaced) — previously the blocker, now closed and live-verified** | `(app)/prompts/[name]` Steps/Run History tabs, per PDR-017 — live-verified: authored `audit-035-chain` (2 steps, `step-2 depends on step-1`), triggered and drove the run to completion via direct REST calls (the UI has no run-trigger control by design — see below), then confirmed the completed run and both steps' resolved content/status rendered correctly in the read-only Run History tab | `006-prompt-registry` (`010-skill-chain-views-ui`, archived) |
| Metrics (org-wide) | `metrics/page.tsx` | Rebuilt | `(app)/metrics` | `008-distribution` (`004-usage-telemetry`, archived) |
| Health / API proxy | `health/route.ts`, `api/[...path]/route.ts` | Intentional exclusion | Generic proxy correctly retired by design (native `src/app/api/**` replaces it). No `/health` liveness route was ported — an ops/infra support endpoint, not a UI workflow; no Acceptance Criterion in the source backlog item depends on it. Not fixed here; out of this checkpoint's scope per `research.md` §4 | `008-distribution` generally (unowned by a specific item) |
| Project-scoped governance | *(none in legacy)* | Rebuilt (additive) | `(app)/projects/[id]` Governance tab (local objectives only) | `005-governance` (`006-project-scoped-governance-ui`, archived) |

**Zero rows remain in an unresolved "missing" state** — FR-004/SC-001 satisfied. Every row is
"rebuilt," "rebuilt (replaced)," "rebuilt (additive)," or an intentional exclusion with rationale.

## Nav-model check (User Story 1, continued)

`src/app/(app)/_components/nav-model.ts` has no stale entries — the prior audit's fix (removing
the dead `workflows` nav entry) held. No new drift found.

## Protected-route sweep (User Story 3)

Live `curl` sweep, no session cookie:

| Route | Result |
|---|---|
| `/dashboard` | 307 → `/login` |
| `/prompts` | 307 → `/login` |
| `/teams` | 307 → `/login` |
| `/teams/:id/policies` | 307 → `/login` |
| `/teams/:id/objectives` | 307 → `/login` |
| `/projects` | 307 → `/login` |
| `/projects/:id` | 307 → `/login` |
| `/metrics` | 307 → `/login` |
| `/settings/api-keys` | 307 → `/login` |
| `/settings/audit-log` | 307 → `/login` |
| `/` (public) | 200 |
| `/login` (public) | 200 |
| `/register` (public) | 200 |
| `/welcome` | 307 → `/login` — **not** the `(app)` auth gate; this is `(auth)/welcome`'s own unrelated "org already exists" single-org guard redirect, confirmed by reading the route, not a bypass of the authenticated-route gate |

**100% of authenticated route families redirect; public pages unaffected.** SC-003 satisfied.

## Summary against Success Criteria

- **SC-001**: ✅ every route family classified, zero "missing."
- **SC-002**: ✅ every core legacy workflow (prompt, policy, objective, team, project, chain-kind
  skill create/view/edit and run) completed live through the composed UI (chain run itself via
  REST, by the design confirmed in `research.md` §3 — not a gap).
- **SC-003**: ✅ 100% redirect coverage confirmed live.
- **SC-004**: ✅ full smoke test completed — see `quickstart.md`'s Smoke Test Results.
- **SC-005**: ✅ zero standalone shells/stand-ins found.
- **SC-006**: pending Phase 7 (backlog item update + archive).
