<!--
Sync Impact Report
==================
Version change: 1.1.0 → 1.2.0 (new principle added)
Modified principles: n/a
Added sections:
  - VIII. Consistent, Accessible UI (new principle, tenets U1-U7)
Removed sections: none
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check gate is generic
    ("[Gates determined based on constitution file]") and already reads from
    this file; no edit needed.
  - ✅ .specify/templates/spec-template.md — no constitution-specific
    references found; no edit needed.
  - ✅ .specify/templates/tasks-template.md — no constitution-specific
    references found; no edit needed.
  - ✅ README.md / CLAUDE.md / docs/ — no outdated constitution references
    found.
Follow-up TODOs: this file's prior revisions used the path `spec/tenets.md`
(singular) in several places below — the real file is `specs/tenets.md`
(plural, matches the repo's actual `specs/` directory). Corrected in this
revision; if a future amendment reintroduces the singular form, fix it back.
Principle IDs (P1, D1, D2, M1-M3, S1-S3, C1-C2, G1, U1-U7) map 1:1 to
specs/tenets.md; keep both files in sync on amendment.
-->

# SkillCanon Constitution

## Core Principles

### I. Test-First Development (Red-Green-Iterate) `[P1]`
Every new piece of backend logic MUST start with a failing test that
demonstrates the requirement, then the minimum code to make it pass, then a
refactor pass with tests green throughout. No production logic MAY land
without a preceding failing test.

Rationale: the backend has no static type checker (no mypy/pyright is
configured, and none is planned before a future TypeScript rewrite), so
tests are the only automated correctness signal the project has. Writing
the test first also forces tenant-scoping questions (see Principle IV) to
surface at design time instead of after the fact.

### II. Domain-Driven Bounded Contexts `[D1]`
The system MUST be organized into explicit bounded contexts — e.g.
`identity` (users, auth, teams-as-tenant), `governance` (policies,
objectives), `registry` (prompts, versions, workflows) — each exposing a
service/contract layer. One context MUST talk to another only through that
contract; it MUST NOT import another context's ORM models directly.

Rationale: services today import each other's models freely across
concerns (for example, governance code reaching directly into identity's
`Team`/`User` models). That seam is exactly what makes it hard to enforce
tenant isolation consistently across the whole system — a contract
boundary is where a rule like "every governance query is tenant-scoped"
gets enforced once, not per call site.

### III. Domain Invariants Live in the Domain Layer `[D2]`
Business rules — e.g. "a policy's tenant is derived from its team, never
accepted as a separate input" — MUST live on the domain model or its
owning service, not be re-implemented per HTTP handler or per transport.

Rationale: authorization logic in this codebase has previously lived
directly inside a router file. As bounded contexts form, rules like this
need to live where every entry point — REST *and* MCP — gets them
automatically, instead of being re-derived (or silently forgotten) at each
new endpoint.

### IV. Multi-Tenant Isolation by Default `[M1, M2, M3]`
The root Team is the tenant. Every tenant-scoped table MUST carry a
`tenant_id` (or be resolvable to one via a required join), and every
service-layer query MUST filter by the caller's tenant_id — a
path- or body-supplied ID MUST NEVER be trusted alone as sufficient
authorization. Postgres Row-Level Security MUST be enabled on every
tenant-scoped table as a defense-in-depth backstop, not as the primary
control — the application layer remains the primary tenant model and what
tests target directly. Every tenant-scoped resource type MUST have at
least one negative test proving that a user in tenant A cannot read or
write a resource belonging to tenant B by ID.

Rationale: some service functions in this codebase query a resource by ID
alone with zero tenant check today. In a single-tenant deployment that is
low-stakes; the moment a second tenant shares an instance, that exact
shape becomes a cross-tenant data leak. "Strong separation" is not
established until there is a passing test per resource type that
deliberately tries to cross the tenant boundary and fails.

### V. Secure by Default `[S1, S2, S3]`
Secrets MUST be hashed at rest and never stored in reversible form
(passwords via bcrypt, API keys via SHA-256; only a short display prefix
may exist unhashed). Untrusted template content (prompt templates) MUST
only ever be rendered through the sandboxed Jinja2 environment
(`SandboxedEnvironment` + `StrictUndefined` + the enforced max include
depth) — never the default `Environment`. No log statement MAY include any
portion of a raw API key, JWT, or password, even truncated.

Rationale: these are patterns the codebase already gets right in most
places (bcrypt/SHA-256 hashing, the sandboxed template renderer); this
principle exists to lock them in against regression, and to close the one
known gap — a debug log line that currently prints a slice of raw API key
material.

### VI. Auditable & Compliant (SOC2) `[C1, C2]`
Every mutation and every cross-tenant-sensitive read MUST be captured in
an audit log — who, what, when, on which tenant/resource — independent of
general usage metrics, and on every transport (REST and MCP alike). All
traffic MUST be encrypted in transit outside local development. No
security-critical setting (JWT secret, auth token, CORS origin, or similar)
MAY ship with a functional default in production — startup MUST fail
loudly if a secret is still at its placeholder value, and
environment-specific configuration MUST come from settings, never a
hardcoded literal.

Rationale: this project is in SOC2 scope with NIST alignment expected.
Today the MCP tool path — the primary way this product is actually used —
does not record usage the way the REST expand endpoint does, which is
exactly the audit-logging gap SOC2 controls require closed. Likewise, CORS
is currently hardcoded to `localhost:3000` and the JWT secret ships with a
working (if labeled) development default; neither should be able to reach
a real deployment unnoticed.

### VII. Feature-Gated by Entitlement `[G1]`
Every new feature — a UI surface, a REST route, an MCP tool — MUST be gated
by a checked entitlement flag before it does real work. Free vs. Paid (and
future custom-override) availability MUST be controlled by flipping an
entitlement value read via `resolveEntitlements()`, never by a separate code
branch, a separate deploy, or a fork. A feature merged without a
corresponding entitlement key is incomplete, not merely under-configured —
including features meant for everyone, which MUST gate on a key that
defaults to enabled for both tiers rather than skipping the gate call
entirely.

Rationale: PDR-004 established entitlements as per-org data specifically so
tier boundaries can move without a redeploy. A feature that ships without a
gate defeats that design and creates retrofit debt — and a real risk of a
Paid-only feature quietly being available to Free, or vice versa — the
moment product changes packaging, which is expected to happen often before
pricing stabilizes.

### VIII. Consistent, Accessible UI `[U1-U7]`
The authenticated `(app)` route group MUST render dark-only and MUST NOT
apply the marketing-only light-theme override. Color, spacing, and type
values MUST come from the shared design tokens (`src/app/globals.css`,
`docs/context/design-system.md`) rather than a hardcoded literal.
Page-level empty/loading/error states MUST use the shared `AppState`
primitive from `@/shared/ui`, with in-page-section (not whole-page) empties
still getting a real `role="status"` wrapper. Every interactive element
MUST show a visible, non-suppressed focus-visible state on keyboard focus.
A new drawer, modal, table, or other reusable cross-page interaction
pattern MUST be built — or extended — as a shared primitive in
`src/shared/ui`, owning its own accessibility contract (ARIA roles, focus
management, keyboard handling), rather than hand-rolled per feature. The
app shell MUST stay usable down to mobile, with primary navigation
collapsing into a reachable off-canvas pattern below the `md:` breakpoint
rather than disappearing. Every new page or drawer MUST have a Vitest +
`axe-core` check asserting zero critical/serious accessibility violations.

Rationale: every clause above encodes a gap this project actually shipped
and had to retrofit — a light-theme leak into the authenticated app, three
independently drifted hand-rolled empty states in one session, missing
focus-visible styling caught only during a dedicated accessibility pass,
15 separately hand-rolled drawers with no `role="dialog"`/`aria-modal`/
focus trap/Escape-to-close between them (found during a manual
screen-reader-equivalent spot-check, not by any automated test), and a
mobile-nav gap that blocked go-live. None of these were style
preferences — each was a real, user-facing defect discovered late because
no shared primitive or automated gate caught it earlier. This principle
exists so the next occurrence of each pattern is caught by a gate, not by
another manual audit pass.

## Technology & Compliance Constraints

- **Stack**: Python/FastAPI backend (SQLAlchemy async + asyncpg, Alembic
  migrations, MCP server), Next.js/TypeScript frontend, PostgreSQL. Docker
  Compose for local dev; Helm chart for Kubernetes deploy. The backend is
  expected to be rewritten in TypeScript in a future initiative — this
  constitution's principles apply regardless of implementation language.
- **Compliance scope**: SOC2 is in scope; NIST 800-53/CSF alignment is
  expected alongside it. HIPAA, GDPR, and PCI are explicitly out of scope
  unless this section is amended.
- **Tenant boundary**: the root Team (organization) is the tenant. Multi-
  organization-per-instance, previously out of scope, is now a first-class
  requirement — see Principle IV.
- **Tenant isolation strategy**: application-layer scoping is the primary
  control; Postgres Row-Level Security is required as a second,
  independent layer. Schema-per-tenant is explicitly not the chosen
  approach.
- The authoritative, example-grounded version of these principles — with
  file/line references into the current codebase — lives at
  `specs/tenets.md`. That file and this constitution MUST be amended
  together.

## Development Workflow & Quality Gates

- **Workflow**: red-green-iterate (Principle I) for all new backend logic;
  a failing test precedes any implementation.
- **Type check**: `cd frontend && npx tsc --noEmit` (backend has none
  configured; tests substitute for it per Principle I).
- **Lint**: `cd backend && ruff check .` and `cd frontend && npm run lint`.
- **Test**: `cd backend && python -m pytest tests/ -v`. New multi-tenant
  resource types are not considered complete without the negative
  cross-tenant test required by Principle IV.
- **Review**: a PR that adds or changes a tenant-scoped table, a domain
  invariant, or anything touching secrets/logging/audit trails MUST be
  checked against the relevant principle above before merge — the "why"
  in each principle names the concrete failure mode to look for.
- **Feature gating**: a PR that adds a new REST route or MCP tool MUST be
  checked for a `requireEntitlement`/`hasEntitlement`/`requireUnderLimit`
  call (Principle VII) before merge — reviewed the same way a new
  tenant-scoped table is checked for RLS. `context/feature-gating.md`
  defines the gate primitive and where it lives on the Billing &
  Entitlements contract; `context/entitlements.md` is the source of truth
  for which keys exist.
- **UI review**: a PR that adds or changes a page or drawer MUST be checked
  against Principle VIII before merge — design tokens used (not hardcoded
  literals), `AppState` used for page-level empty/loading/error states,
  visible focus states preserved, a shared `src/shared/ui` primitive reused
  (or extended) rather than a new hand-rolled interaction pattern
  introduced, mobile layout not broken, and an `axe-core` check added.

## Governance

This constitution supersedes ad-hoc practice where the two conflict. All
PRs and reviews MUST verify compliance with the principles above;
complexity or deviation from a principle MUST be explicitly justified in
the PR description, not silently merged. Amendments to this constitution
MUST update `specs/tenets.md` in the same change, and MUST state which
principle(s) changed and why. Versioning follows semantic versioning:
MAJOR for backward-incompatible principle removals or redefinitions,
MINOR for new principles or materially expanded guidance, PATCH for
wording/clarification fixes. Compliance review (SOC2/NIST-relevant
controls: access control, audit logging, encryption) is currently manual
until a dedicated automated check exists — treat that as a standing gap
this constitution's principles are meant to close over time, not a reason
to skip review.

**Version**: 1.2.0 | **Ratified**: 2026-07-20 | **Last Amended**: 2026-08-09
