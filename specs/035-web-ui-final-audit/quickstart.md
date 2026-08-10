# Quickstart: Web UI Final Composition & Integration Check — Re-Verification

## Prerequisites

- The shared self-hosted stack running: `spechub-app-1` (Next.js app, `http://localhost:3000`)
  and `spechub-database-1` (Postgres). Confirm with `docker ps`; do not rebuild unless a real fix
  from this feature touches `Dockerfile`/`docker-compose.yaml`/`database/` (per this repo's own
  documented convention — see CLAUDE.md).
- A browser session (claude-in-chrome) for the live UI walkthrough.
- `curl` (or equivalent) for the chain-run REST steps, since the UI has no run-trigger control by
  design (`research.md` §3).

## Validation scenario 1 — Shell composition (User Story 1)

1. Sign in as an active user.
2. Visit each nav entry (Overview, Prompts, Governance, Teams, Projects, Metrics, API keys, Audit
   log) and confirm each renders inside the same shell chrome (sidebar/header unchanged) with the
   correct item highlighted active.
3. Visit `teams/[teamId]/objectives` and the project detail page's Governance tab directly by URL
   and confirm both still render inside the shell.

**Expected outcome**: every page uses one shell; no second sidebar/header appears anywhere.

## Validation scenario 2 — Legacy parity (User Story 2)

Walk `research.md` §2's matrix row by row; for every "Rebuilt"/"Rebuilt (replaced)"/"Rebuilt
(additive)" row, exercise the corresponding create/view/edit action live and confirm it completes
without leaving the composed UI or calling the REST API directly.

**Expected outcome**: `parity-audit.md` is written recording pass/fail per row; per FR-004, zero
rows may remain "missing."

## Validation scenario 3 — Protected routes (User Story 3)

1. Sign out (or use an incognito/unauthenticated session).
2. Request each `(app)` route directly by URL, including the newer
   `teams/[teamId]/policies`/`objectives` and the project Governance tab.

**Expected outcome**: every request redirects to `/login`; none render authenticated content.

## Validation scenario 4 — End-to-end smoke test (User Story 4)

1. Register a fresh org (or reuse one) → creates the first team.
2. Create a project.
3. Create a policy via `teams/[teamId]/policies` (not the REST API directly).
4. Create a prompt, publish a template-kind version, expand it, confirm the applied policy appears
   in the expansion result. *(This exact sub-flow already passed once — see the backlog item's own
   2026-08-05 smoke-test note — this run reconfirms it still holds.)*
5. Author a chain-kind skill version with at least two steps via `chain-step-builder.tsx` on the
   prompt detail page.
6. Trigger and drive the run via REST directly (the UI has no control for this, by design):
   ```bash
   curl -X POST http://localhost:3000/api/skills/<name>/chain-runs \
     -H "Authorization: Bearer <api-key>" -H "Content-Type: application/json" -d '{...}'
   curl -X POST http://localhost:3000/api/skills/<name>/chain-runs/<runId>/advance \
     -H "Authorization: Bearer <api-key>" -H "Content-Type: application/json" -d '{...}'
   ```
   (repeat `advance` per step until the run reaches a terminal state.)
7. Return to the prompt detail page's Run History tab and confirm the run and each step's
   resolved content/status render correctly.

**Expected outcome**: every step succeeds; step 7 proves the UI's read-only view correctly
reflects a run driven entirely by direct API calls, matching how a real external agent uses it.

## Recording results

Record scenario 1–4 outcomes in this feature's own `parity-audit.md` (scenario 2) and a
"Smoke Test Results" section appended to this file (scenarios 1, 3, 4) during implementation —
this is the evidence FR-009/SC-006 require before the source backlog item can be archived.

## Smoke Test Results (2026-08-09/10)

Run live against `spechub-app-1`/`spechub-database-1`, org "Acme Corp", team "Platform"
(pre-existing from the backlog item's own earlier 2026-08-05 smoke test), user Alice Admin.

**Pre-flight fix**: the shared dev DB was found 3 migrations behind (`__drizzle_migrations` at 27
of 30), silently breaking prompt detail pages. Fixed via `pnpm db:migrate` before the flow below —
see `parity-audit.md`'s "Live-blocking issue found and fixed" section for full detail.

| Step | Method | Outcome |
|---|---|---|
| Team | Reused (pre-existing "Platform") | Pass — same UI-created team from the item's prior 2026-08-05 run |
| Project | UI (`+ New project` drawer) | Pass — created "UI Final Audit 035", appeared instantly in list |
| Policy | UI (`teams/[teamId]/policies` → New policy) | Pass — created `audit-035-no-secrets` (append, priority 30), appeared instantly in scope tree |
| Prompt + expand | UI (`+ New prompt` → New version → Preview tab) | Pass — created `audit-035-prompt` v1 (template kind), Preview showed both `audit-035-no-secrets` and the pre-existing `require-typed-errors` policy content appended, in priority order |
| Chain authoring | UI (`chain-step-builder.tsx`, Chain tab) | Pass — created `audit-035-chain` v1 with 2 steps (`audit-035-prompt` → `smoke-test-prompt`, step 2 depends on step 1) |
| API key issuance | UI (`settings/api-keys` → Issue key, `workflows:run` scope) | Pass — key issued, one-time raw value shown correctly |
| Chain run start | REST (`POST /api/skills/audit-035-chain/chain-runs`) | Pass — `runId` returned, step 1 resolved with both policies applied |
| Chain run advance ×2 | REST (`POST /api/chain-runs/{runId}/advance`, stepIndex 0 then 1) | Pass — step 2 resolved after step 1 reported; final response `{"done":true}` |
| Run terminal state | REST (`GET /api/chain-runs/{runId}`) | Pass — `status: "completed"`, both steps `reportedStatus: "success"` with resolved content and applied policies persisted |
| Run History UI | UI (prompt detail page → Run History tab) | Pass — completed run listed, both steps' resolved content and `success` status rendered correctly, matching the REST response exactly |

**Result**: SC-004 fully satisfied. Every step from the backlog item's original manual smoke test
(team → project → policy → prompt → expansion) reconfirmed, extended through chain authoring and
an API-triggered run to a genuine terminal state, with the read-only Run History view proven
accurate against a run it never triggered itself.
