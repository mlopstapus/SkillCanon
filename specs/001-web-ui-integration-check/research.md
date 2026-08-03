# Phase 0 Research: Web UI Final Composition & Integration Check

No `NEEDS CLARIFICATION` markers remained after `/speckit-clarify` (see Planning Agent's handoff). The two open questions this phase resolves are about audit method, not product behavior.

## Decision: How to verify each route family

- **Decision**: Verify via (1) filesystem/route audit of `src/app/(app)` and `src/app/(auth)` against `legacy/frontend/src/app`, (2) live HTTP checks against the already-running dev stack (`docker compose`, remapped to `localhost:3001`) for redirect behavior, and (3) reading each workflow's server action / route handler to confirm it calls real `@/bcs/*` application-layer functions rather than mock/seeded data.
- **Rationale**: Next.js App Router routing is filesystem-based and exhaustive — a missing `page.tsx` for a route family is a definitive, not probabilistic, finding. Combined with a live redirect sweep and direct code reads of the actual data path, this gives conclusive evidence for FR-001/FR-002/FR-011/FR-012/FR-016 without needing a full interactive browser session for every branch.
- **Alternatives considered**: Full Playwright/chromium-cli-driven interactive walkthrough of every workflow. Rejected as unavailable in this sandboxed environment (no `chromium-cli`, no Playwright browsers installed, and installing them is a heavyweight, disruptive environment change for a verification-only feature) — see quickstart.md for what live checks *were* run against the real running instance.

## Decision: Scope of code changes permitted

- **Decision**: The only code change this feature makes is removing the `workflows` nav entry from the shared `nav-model.ts` (and its test fixture), because it points at a route (`/workflows`) that a prior architecture decision (PDR-017, `006-prompt-registry/009-skill-chains.md`) retired outright — there will never be a page at that route, by design (`010-skill-chain-views-ui.md`'s own acceptance criteria explicitly say "no separate workflows navigation entry"). This is composition wiring into the shared shell, not building a new page, so it is in scope per FR-015/FR-002.
- **Rationale**: Distinguishing "stale/retired" (fix now) from "not yet built" (record as a gap against the owning epic, per FR-015) is the load-bearing judgment call in this feature. `/metrics` and `/teams/{id}/policies` nav entries point at pages that ARE still planned (open backlog items `008-distribution/004-usage-telemetry.md` and `005-governance/005-governance-views-ui.md`) — those are left in place and recorded as gaps, not removed, since removing them would misrepresent a "not yet built" state as "will never exist."
- **Alternatives considered**: Leaving the stale `workflows` entry in place and only recording it as a gap. Rejected — it is not an ownership gap (no epic will ever build `/workflows`), it is dead chrome the shell itself must stop presenting, matching FR-002's "no standalone shell/duplicate chrome" intent extended to a nav entry with nothing behind it.

## Decision: Where audit evidence lives

- **Decision**: `specs/001-web-ui-integration-check/parity-audit.md` holds the full legacy-route parity matrix (FR-003/FR-004); `quickstart.md` holds the protected-route sweep results and smoke-flow walkthrough/findings (FR-017).
- **Rationale**: Keeps the audit evidence versioned alongside the spec, matching this repo's existing Speckit artifact convention, and gives future runs on this issue a single place to re-read findings instead of re-deriving them from comments.
