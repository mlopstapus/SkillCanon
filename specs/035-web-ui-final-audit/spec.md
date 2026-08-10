# Feature Specification: Web UI Final Composition & Integration Check — Re-Verification

**Feature Branch**: `035-web-ui-final-audit`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: backlog item `backlog/008-distribution/003-web-ui-shell-and-core-pages.md` ("Web UI Final Composition & Integration Check"). This feature owns no page of its own — it is the checkpoint where every bounded context's independently-built UI is confirmed composed into the real app shell, checked for full parity against the legacy frontend, and exercised end to end. A prior pass of this same checkpoint (`specs/001-web-ui-integration-check`, merged via PR #56 on 2026-08-03) found the shell composition and most pages complete, but recorded two real gaps as blockers: no policy/objective UI existed anywhere, and no skill-chain (then "workflow") authoring/viewing UI existed. Both gaps have since shipped and archived (`backlog/done/005-governance/archive/005-governance-views-ui.md`, `backlog/done/005-governance/archive/006-project-scoped-governance-ui.md`, and skill-chain views UI under prompt-registry, folded per PDR-017). This feature re-runs the shell-composition audit, the legacy-parity audit, and the full end-to-end smoke test now that both blockers are closed, so the backlog item — and with it epic 008 (Distribution) — can finally close.

## Clarifications

### Session 2026-08-09

- Q: If the re-audit finds a genuine (non-trivial) UI gap, should this feature also fix it inline, or only file it and leave the backlog item open? → A: This feature's Definition of Done is "the backlog item closes" — any gap found, however large, must be fixed inline as part of this feature until the item can be archived.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirm every bounded-context page still composes into the one real shell (Priority: P1)

A signed-in user reaches every rebuilt bounded-context page — dashboard, org-wide metrics, projects, prompts (including chain-kind skills), teams, team policies, team objectives, project-scoped governance, and settings (API keys, audit log) — through the single shared application shell, with no page rendering under a placeholder layout, a duplicate auth gate, or stale navigation chrome.

**Why this priority**: If any page has drifted out of the shared shell since the last check, the product is not usable end to end even though each page works in isolation. This is the entire purpose of the checkpoint.

**Independent Test**: Sign in as an active user and navigate to every page reachable from the shell's own navigation, confirming each renders inside the shared shell with the correct active nav state and no second sidebar/header/footer.

**Acceptance Scenarios**:

1. **Given** an active signed-in user, **When** they open each rebuilt bounded-context page from shell navigation, **Then** the page renders inside the one shared app shell.
2. **Given** the shell's own navigation model, **When** it is compared against every page that now actually exists, **Then** there is no dead nav entry pointing at a retired concept (e.g. a standalone "workflows" route) and no missing nav entry for a page that now exists but isn't linked — any such drift found is fixed within this feature, not merely logged.
3. **Given** any standalone shell or middleware stand-in a bounded-context epic may have built ahead of the real shell, **When** the audit runs, **Then** it is confirmed removed from the codebase — if one is still present, this feature removes it.

---

### User Story 2 - Re-run the legacy parity audit with both prior gaps closed (Priority: P1)

A reviewer re-compares the rebuilt UI against the legacy `legacy/frontend/src/app/*` route tree, now expecting full parity (or a documented intentional exclusion) for every route family, including the two families the prior audit flagged as missing: team policy/objective management and workflow (now skill-chain) authoring/viewing.

**Why this priority**: The prior audit is the baseline; this story is what actually proves the backlog item's Acceptance Criteria ("every core workflow available in the legacy frontend ... is available in the rebuilt UI") now holds, rather than re-stating a known-incomplete result.

**Independent Test**: Update the existing route/workflow parity matrix, re-classifying the two previously-open rows (governance, workflow/skill-chain) against the code that now exists, and confirm every other row still holds.

**Acceptance Scenarios**:

1. **Given** the legacy `teams/page.tsx` inline policy/objective CRUD, **When** the reviewer exercises policy and objective create/edit/delete in the rebuilt UI, **Then** each operation completes through a real page or drawer inside the composed shell, not a direct API call.
2. **Given** the legacy `workflows/*` route tree, **When** the reviewer exercises creating and viewing a chain-kind skill and running it, **Then** the equivalent flow completes inside the composed prompt detail page per PDR-017's intentional replacement, and the outcome (a runnable multi-step chain) is achievable without leaving the UI.
3. **Given** every other previously-confirmed-parity route family (auth/onboarding, settings, teams, projects, prompts, metrics), **When** re-checked, **Then** parity still holds and no regression has been introduced since the prior audit.
4. **Given** the full matrix is complete, **When** every row is either "rebuilt", "intentionally replaced with a named destination", or "intentionally excluded with a documented rationale", **Then** there are zero rows left in an unresolved "missing" state.

---

### User Story 3 - Confirm protected-route behavior still holds (Priority: P2)

An unauthenticated visitor, or a visitor with an expired/invalid session, cannot reach any route inside the authenticated app shell, across every bounded context's pages, including any added since the prior check.

**Why this priority**: Composition changes since the last audit (new governance and skill-chain pages) are exactly the kind of change that could accidentally miss the shell's auth gate if a page were added outside the normal route group.

**Independent Test**: Attempt to load each authenticated route family while signed out and confirm every one redirects to `/login`.

**Acceptance Scenarios**:

1. **Given** no active session, **When** any `(app)` route is requested directly by URL, **Then** the response redirects to `/login`.
2. **Given** the newly-added governance pages (team policies, team objectives, project governance tab) and the skill-chain authoring UI, **When** checked while signed out, **Then** they redirect exactly like every other `(app)` route — no new page bypasses the shared gate.

---

### User Story 4 - Run the full end-to-end smoke test through a governed, chained skill (Priority: P2)

A reviewer performs the complete workflow the backlog item's Acceptance Criteria describes: create a team, create a project, create a policy through the real governance UI, create a prompt, expand it and confirm the applied policy appears — all through the composed UI — then additionally author a multi-step chain through the UI, trigger a run of it the same way a real external agent would (a direct call against the chain-run REST API, since the web UI deliberately exposes no run-trigger control — see Assumptions), and confirm the run's step-by-step result renders correctly back in the UI's read-only run-history view.

**Why this priority**: This is the concrete, already-partially-passed smoke test named in the backlog item, extended to also cover the previously-unbuildable chain-run step now that skill-chain UI exists.

**Independent Test**: Walk the flow end to end in a live self-hosted instance and record the result of each step.

**Acceptance Scenarios**:

1. **Given** a fresh org created via registration, **When** the reviewer creates a team, project, policy (via the real team-policy UI, not the REST API directly), and prompt, **Then** each step succeeds through the composed shell.
2. **Given** the prompt from the previous step, **When** it is expanded via the UI, **Then** the applied policy appears in the result exactly as the backlog item's existing (already-passed) smoke test recorded.
3. **Given** the same project, **When** the reviewer authors a chain-kind skill with at least two steps via the UI, then drives that chain's run to a terminal state via the same REST calls a real agent would make (the UI has no run-trigger control by design), **Then** every step's resolved content and self-reported status is visible back in the UI's run-history view without querying the API directly to read it.

### Edge Cases

- A page that exists in code but was never linked from shell navigation (reachable only by typing the URL) — is that "composed into the shell" for this audit's purposes, or a gap? Treated as a gap: every rebuilt page must be reachable through shell navigation, not just existent.
- A legacy route family with no rebuilt equivalent and no owning epic left to build it (e.g. the generic backend API proxy, correctly retired by design) — recorded as an intentional exclusion with rationale, not a blocking gap.
- A chain step that fails during the User Story 4 run — the smoke test still counts as passed if the failure is visible and attributable in the UI (proving error visibility), since the Acceptance Criteria asks for the flow to be reachable and observable, not for every run to succeed.
- A gap found during the audit turns out to require work belonging to a bounded context this feature has no natural authority over (e.g. a missing capability that isn't just composition wiring but a genuinely new domain rule) — per the Clarifications answer above, this feature still owns closing it, but the fix MUST still respect that context's own contract/ownership boundaries (`CONTRACT.md`/`OWNERSHIP.md`) rather than reaching around them; it is scoped work within this feature, not a license to bypass bounded-context ownership.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The audit MUST confirm every owning bounded context's page (governance, prompt-registry including chain-kind skills, identity-access/settings, audit-compliance, distribution metrics) is wired into the real shared shell from `004-app-shell-and-landing`, with no page composing into a stale or placeholder layout.
- **FR-002**: The audit MUST confirm no standalone shell or middleware stand-in remains active anywhere in the codebase; any such stand-in found MUST be removed as part of this feature, not merely flagged.
- **FR-003**: The audit MUST re-produce a full legacy-to-rebuilt route/workflow parity matrix covering every route family in `legacy/frontend/src/app/*`, updating the two previously-open rows (policy/objective management, workflow/skill-chain authoring) to their current, real state.
- **FR-004**: Every row in the parity matrix MUST end in one of three states: rebuilt with parity, intentionally replaced (with the replacement named), or intentionally excluded (with a documented rationale) — no row may be left as an unresolved gap.
- **FR-005**: The audit MUST confirm every core legacy workflow (create/view/edit a prompt, policy, objective, team, project, and chain-kind skill) is completable end to end through the composed UI, without a direct API or database call.
- **FR-006**: The audit MUST confirm unauthenticated access to every `(app)` route — including any page added since the prior audit — redirects to `/login`.
- **FR-007**: The audit MUST perform the full manual smoke test named in the backlog item: create team → create project → create policy (via the governance UI) → create prompt → expand it → confirm the applied policy appears in the result — and additionally exercise authoring a multi-step chain via the UI and driving its run to a terminal state via the chain-run REST API (matching how a real external agent runs a chain — the UI itself has no run-trigger control, by design, per `010-skill-chain-views-ui`'s own Acceptance Criteria), then confirm the run's result renders correctly in the UI's read-only run-history view.
- **FR-008**: If a real gap is found during this audit (a page nobody built, a bounded context not composed into the shell, a broken redirect, a missing workflow step), it MUST be fixed as part of this feature — including building any missing page, drawer, or wiring code required — rather than only being filed against the owning bounded context's epic. The finding MUST still be documented (what was missing, where, why) even though it was also fixed here.
- **FR-009**: The audit's findings and fixes MUST be recorded in a form that lets the source backlog item (`008-distribution/003-web-ui-shell-and-core-pages.md`) actually be closed and archived once every Acceptance Criterion and Requirement in it is verifiably met — not merely documented as met.
- **FR-010**: Any UI code built to close a gap under FR-008 MUST comply with the project's existing UI conventions (shared design tokens, `AppState` for page-level empty/loading/error states, visible focus states, a shared `src/shared/ui` primitive reused or extended rather than hand-rolled, mobile-usable layout, and an `axe-core` accessibility check) — the same bar every other page and drawer in this codebase is already held to, not a reduced bar because the code originates from an audit checkpoint.
- **FR-011**: Any new route or UI surface built to close a gap under FR-008 (as opposed to wiring an already-entitled page into the shell) MUST be gated by a checked entitlement flag before it does real work, per the project's existing feature-gating convention — never shipped ungated because it originated from an audit fix rather than a new feature.

### Key Entities

- **Parity matrix row**: one legacy route family, its classification (rebuilt / replaced / excluded), its rebuilt destination or rationale, and the owning epic/feature responsible for it.
- **Smoke test run**: the ordered sequence of UI actions (team → project → policy → prompt → expansion → chain run) and the observed outcome of each step, used as the concrete evidence for FR-007.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of route families in the legacy frontend have a documented, non-"missing" classification in the re-produced parity matrix.
- **SC-002**: Every core legacy workflow (prompt, policy, objective, team, project, project membership, chain-kind skill create/view/edit and run) can be completed by a reviewer entirely within the composed UI, with zero direct API/database steps required.
- **SC-003**: 100% of authenticated route families, including every page added since the prior audit, redirect an unauthenticated visitor to `/login`.
- **SC-004**: The full smoke test (team → project → policy → prompt → expansion → chain authoring → API-triggered chain run) completes, with the chain run reaching a terminal state and every step's outcome observable afterward in the UI's read-only run-history view.
- **SC-005**: Zero standalone shell or middleware stand-ins remain active in the codebase outside the one shared app shell.
- **SC-006**: The source backlog item's own Acceptance Criteria and Requirements checklist is actually marked fully complete and archived by the end of this feature — any gap this audit found along the way was fixed, not merely logged as still-open.

## Assumptions

- This feature may need to build real page, drawer, or wiring code if the audit finds a genuine gap — unlike the prior pass (`specs/001-web-ui-integration-check`), which only fixed trivial composition wiring inline and filed everything else forward. Per the Clarifications answer above, this feature owns closing the backlog item, so any gap found is fixed here rather than only filed. Given both previously-known blockers (governance UI, skill-chain UI) are already shipped, the realistic remaining gaps are expected to be small (wiring, missed nav links, a narrow missing action) rather than a whole new page tree — but the feature is scoped to handle a larger gap if the audit surfaces one.
- "Workflow" in the legacy frontend and in the backlog item's original wording refers to what the codebase now calls a chain-kind skill (multi-step `PromptVersion`), per PDR-017 — there is no separate `/workflows` route to rebuild, by design.
- Org-wide metrics (`/metrics`) and the legacy health/API-proxy routes were already resolved by prior work (`008-distribution/archive/004-usage-telemetry.md`; the generic backend proxy is correctly retired by design) and are re-confirmed rather than re-investigated from scratch.
- The live smoke test runs against a local self-hosted instance (Docker Compose or `pnpm dev`), consistent with how the backlog item's existing partial smoke test was already performed.
- **Confirmed during planning research, correcting this spec's initial assumption**: the web UI intentionally has no control that starts or advances a chain run — `backlog/done/006-prompt-registry/archive/010-skill-chain-views-ui.md`'s own Acceptance Criteria explicitly require this ("exposes no control that starts or advances a run"), since Prompt Registry never executes a step or observes a model's output; a real run only ever happens client-side in whatever agent (Claude Code, another IDE) is executing the chain against the REST API directly. This is not a UI gap for this feature to fix — building a run-trigger button would contradict an already-shipped, deliberate design decision. The smoke test's "run" step is therefore performed via a direct REST call (simulating an external agent), with the UI's role limited to correctly rendering that run's history afterward.
- A missing `/health` liveness route (present in the legacy frontend as a proxy to the old backend, absent in the rebuilt app) remains a real but out-of-scope gap: it is an ops/infra support endpoint, not a UI workflow, and no Acceptance Criterion in the source backlog item depends on it. The parity matrix records it as an intentional exclusion with this rationale rather than a gap FR-008 requires fixing.
