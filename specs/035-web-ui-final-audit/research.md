# Phase 0 Research: Web UI Final Composition & Integration Check — Re-Verification

This feature has no technology unknowns to research — it re-verifies the state of an existing,
already-built codebase. Phase 0's actual work was performing the audit itself (direct filesystem
and source inspection), since the codebase's current composition state is the thing this feature
needs to resolve before planning fix work. Findings below are what Phase 1/tasks build on.

## 1. Shell composition (User Story 1 / FR-001, FR-002)

**Decision**: Shell composition is clean. No fix required.

**Evidence**:
- Exactly three `layout.tsx` files exist under `src/app`: the root layout, `(auth)/layout.tsx`,
  and `(app)/layout.tsx`. No standalone/duplicate shell exists anywhere.
- `src/app/(app)/layout.tsx` calls `resolveAppShellAccess`, redirects to `/login` when
  unauthenticated, and renders every page through the single `AppShell` component with
  `AppNavigation`. No page in `src/app/(app)/**` bypasses this layout (Next.js App Router routing
  makes a bypass structurally impossible without a sibling route group, and none exists).
- `src/app/(app)/_components/nav-model.ts` was already fixed by the prior audit
  (`specs/001-web-ui-integration-check`) — no stale nav entry (e.g. the previously-removed
  `workflows` entry) remains. Current nav: Overview, Prompts, Governance, Teams, Projects,
  Metrics, API keys, Audit log. Every entry maps to a page that exists; every page that exists
  under Workspace/Settings has a nav entry (governance uses a regex active-match against
  `/teams/:id/(policies|objectives)` rather than a direct href match, and correctly resolves).
- `settings/audit-log/access.ts`'s `canAccessAuditLog` (a role check layered inside the
  already-authenticated shell) is not a competing auth gate — confirmed again, matches the prior
  audit's own finding.

**Alternatives considered**: N/A — this is a factual audit, not a design decision.

## 2. Legacy parity matrix (User Story 2 / FR-003, FR-004, FR-005)

**Decision**: Re-produce the full matrix in `parity-audit.md` at the same fidelity as the prior
pass. Both previously-open rows are now genuinely closed.

**Evidence** (legacy `legacy/frontend/src/app/*` vs. rebuilt `src/app/(app)/**` +
`src/app/(auth)/**`, direct file inspection):

| Legacy route family | Rebuilt destination | State |
|---|---|---|
| Welcome / root | `src/app/page.tsx` + `(auth)/welcome` | Rebuilt |
| Login / register / invite | `(auth)/login`, `(auth)/register`, `(auth)/invite/[token]` | Rebuilt |
| Settings — API keys | `(app)/settings/api-keys` | Rebuilt |
| Settings — audit log | *(net new, no legacy equivalent)* | Rebuilt (additive) |
| Teams (membership) | `(app)/teams` | Rebuilt |
| Teams — policy/objective CRUD | `(app)/teams/[teamId]/policies`, `.../objectives` (shared `GovernancePage`, scope tree, inherited/local split) | **Rebuilt — previously the blocker, now closed** (`005-governance-views-ui`) |
| Projects | `(app)/projects`, `(app)/projects/[id]` (members/repos/teams/metrics/governance tabs) | Rebuilt |
| Prompts | `(app)/prompts`, `(app)/prompts/[name]` (drawers replace legacy `/new` and `/new-version` standalone routes) | Rebuilt (replaced, same outcome) |
| Workflows | Retired as a route family per PDR-017; chain-kind `PromptVersion` composed into `(app)/prompts/[name]` (`chain-step-builder.tsx`, Steps/Run-History tabs) | **Rebuilt (replaced) — previously the blocker, now closed** (`010-skill-chain-views-ui`) |
| Metrics (org-wide) | `(app)/metrics` | Rebuilt (`004-usage-telemetry`, closed since the prior audit) |
| Health / API proxy | No equivalent (`/health` liveness route never ported); generic backend proxy correctly retired by design | Intentional exclusion — see §4 below |
| Project-scoped governance | *(net new, no legacy equivalent)* — `(app)/projects/[id]` Governance tab, local objectives only | Rebuilt (additive, `006-project-scoped-governance-ui`) |

Every row now resolves to "rebuilt," "rebuilt (replaced)," "rebuilt (additive)," or a documented
intentional exclusion. Zero rows remain in an unresolved "missing" state — this satisfies FR-004
and SC-001 as written.

**Alternatives considered**: N/A — factual audit.

## 3. Chain run trigger — spec correction (User Story 4 / FR-007)

**Decision**: The web UI intentionally has **no control that starts or advances a chain run**.
This spec's initial draft assumed a run could be triggered end-to-end through the UI; that
assumption was wrong and has been corrected in `spec.md` (Assumptions section) based on this
finding, not treated as a gap to build.

**Evidence**: `backlog/done/006-prompt-registry/archive/010-skill-chain-views-ui.md`'s own
Requirements and Acceptance Criteria explicitly state: "There is no 'run' action anywhere in this
UI; the web UI never calls `startSkillChainRun`/`advanceSkillChainRun`" and "exposes no control
that starts or advances a run" — both checked off as delivered and archived. Rationale (from the
same file): Prompt Registry never executes a step or observes a model's output; a real run only
ever happens client-side in whatever agent (Claude Code, another IDE) is executing the chain
against the REST API directly (`POST /api/skills/[name]/chain-runs`,
`POST /api/skills/[name]/chain-runs/[runId]/advance`). The standalone `cli/` package
(`029-skill-sync-cli`) also has no chain-run command (`cli/src/commands/` is limited to
`init`/`run`/`sync`, where `run` calls `expand`, not chain-run) — confirming there is genuinely no
first-party client that triggers a chain run today except a direct REST call, by design.

**Implication for the smoke test**: User Story 4's chain-run step is performed via a direct REST
call against the already-existing, already-tested chain-run endpoints (simulating what a real
external agent does), not via any UI control. The UI's job — and what the smoke test actually
verifies — is that the resulting run renders correctly in the existing read-only run-history view.

**Alternatives considered**: Building a run-trigger button in the UI to make FR-007's original
"run it via the UI" language literally true. **Rejected** — this would directly contradict an
already-shipped, deliberately-designed, and archived Acceptance Criterion in
`010-skill-chain-views-ui`. Per this feature's own Edge Cases entry on respecting bounded-context
ownership boundaries, fixing a "gap" by reversing another feature's intentional design decision is
out of bounds; the correct fix is to correct this spec's mistaken assumption instead, which has
been done.

## 4. `/health` liveness route — scope boundary

**Decision**: Recorded as an intentional exclusion in the parity matrix, not a gap FR-008 requires
fixing.

**Rationale**: It is an ops/infra support endpoint (liveness probe), not a UI workflow. No
Acceptance Criterion in `008-distribution/003-web-ui-shell-and-core-pages.md` depends on it. The
prior audit reached the same classification. Building it would be real, valid work — but it
belongs to Distribution's REST API surface generally, not this "Web UI ... Integration Check"
feature; adding it here would be scope creep unrelated to the UI composition/parity question this
checkpoint exists to answer.

## 5. Protected-route re-check (User Story 3 / FR-006)

**Decision**: No new authenticated route has been added outside the standard `(app)` route group
since the prior audit — every new page (`teams/[teamId]/policies`, `.../objectives`, the project
Governance tab) is a child route inside the already-gated `(app)` layout, so the existing
`resolveAppShellAccess` → `redirect("/login")` check covers them automatically. This will be
confirmed live (not just by code inspection) during the smoke test, since App Router route-group
gating is enforced per-request, not statically provable from file layout alone.

## 6. Verification environment

**Decision**: Use the already-running shared Docker Compose stack (`spechub-app-1`,
`spechub-database-1`, confirmed up via `docker ps`) for the live smoke test, rather than rebuilding
— consistent with this repo's documented convention of not disrupting a long-lived shared dev
stack for a change that doesn't touch `Dockerfile`/`docker-compose.yaml`. No rebuild is expected
to be needed since Phase 0 found no code fix required.
