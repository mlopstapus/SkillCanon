# Implementation Plan: MCP Server & Tools

**Branch**: `001-mcp-server-tools` | **Date**: 2026-08-03 | **Spec**: `specs/001-mcp-server-tools/spec.md`

**Input**: Feature specification from `/specs/001-mcp-server-tools/spec.md`

## Summary

Port the legacy Python MCP surface to the TypeScript/Next.js application as a strict compatibility endpoint at `/mcp`. The implementation will use the official `@modelcontextprotocol/sdk` Streamable HTTP transport in a Next route handler, authenticate bearer API keys through `authenticateApiKey(authDb, rawKey)`, cache only ephemeral per-session caller/context-delivery state in process memory, and implement the six legacy tools by reusing existing bounded-context application services for prompt listing/search/context/expansion and skill-chain workflow equivalents. `sh-run` will wrap expansion in the existing audit transaction helper and record prompt usage, while all logging and error paths avoid raw API key material.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 24.x, Next.js 16 route handlers

**Primary Dependencies**: Next.js App Router, Drizzle ORM/Postgres.js, Zod, official `@modelcontextprotocol/sdk` TypeScript SDK (`1.30.0` current on npm 2026-08-03), existing bounded contexts: identity-access, governance, prompt-registry, distribution, audit-compliance, billing-entitlements

**Storage**: PostgreSQL through existing `db` and `authDb`; no new tables or migrations. MCP session state is in-memory only.

**Testing**: Vitest unit/integration tests, route-handler tests, characterization tests against the legacy Python output contract encoded in fixtures/assertions.

**Target Platform**: Linux-hosted Next.js server process; MCP clients using Streamable HTTP against `/mcp`.

**Project Type**: Web service endpoint inside a Next.js application.

**Performance Goals**: Tool invocation should add only one API-key validation lookup on session cache miss; uninterrupted sessions reuse cached caller identity. Tool listing/search operate on existing accessible prompt queries and preserve current pagination-equivalent caps.

**Constraints**: Public tool names, argument shapes, formatted text responses, validation/failure semantics, and first-response session-context injection must match legacy behavior. `authenticateApiKey` must receive `authDb`, not ordinary `db`. No raw API key substrings may be logged or returned. No durable session store is allowed.

**Scale/Scope**: One public MCP endpoint, six tools, in-memory session map keyed by MCP session/request session id, and tests covering discovery, auth rejection, session restart, audit/usage, cross-tenant denial, and log safety.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **P1 Test-first**: PASS. New MCP backend behavior will be introduced behind failing Vitest tests first: tool contract/formatting, auth, session cache, audit/usage, log safety, and route handler behavior.
- **D1 Bounded contexts**: PASS. MCP composition code will call exported application services from identity-access, governance, prompt-registry, distribution, audit-compliance, and billing-entitlements; it will not import another BC's ORM schema directly except where tests query persisted audit/usage rows as established local test pattern.
- **D2 Domain invariants**: PASS. Tenant access, prompt accessibility, project membership, chain-run authorization, and governance resolution stay in existing application services.
- **M1-M3 Tenant isolation**: PASS. All tenant-scoped work runs under `withTenantContext(db, caller.organizationId, ...)`, and inaccessible prompts/projects/workflows return not-found-compatible messages.
- **S1-S3 Secure by default**: PASS. API keys are resolved by hash through `authenticateApiKey`; MCP logs never include raw key material or prefixes, correcting the legacy Python gap.
- **C1-C2 Auditable & compliant**: PASS. `sh-run` expansion will use `withAudit()` plus `record()` and `recordPromptUsage()` for each completed expansion covered by the current expansion audit policy.
- **G1 Feature-gated by entitlement**: PASS. The MCP endpoint/tool invocation path will call `assertCoreFeaturesEnabled()` after caller resolution and before doing tenant-scoped work, matching current core-feature route gating stand-in.

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-server-tools/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mcp-server-tools.contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   └── mcp/
│       ├── route.ts
│       └── route.test.ts
├── bcs/
│   └── distribution/
│       ├── application/
│       │   ├── mcp-session.ts
│       │   ├── mcp-session.test.ts
│       │   ├── mcp-tools.ts
│       │   ├── mcp-tools.test.ts
│       │   └── mcp-tool-characterization.test.ts
│       └── index.ts
└── shared/
    └── logging/
```

**Structure Decision**: Keep MCP as Distribution application behavior because it is an external distribution surface that composes identity, governance, registry, workflow/skill-chain, audit, and usage contexts. The Next route at `src/app/mcp/route.ts` is only the transport adapter; tool logic lives in `src/bcs/distribution/application/`.

## Complexity Tracking

No constitution violations require justification.

## Phase 0 Research

See `specs/001-mcp-server-tools/research.md`.

## Phase 1 Design & Contracts

See `specs/001-mcp-server-tools/data-model.md`, `specs/001-mcp-server-tools/contracts/mcp-server-tools.contract.md`, and `specs/001-mcp-server-tools/quickstart.md`.

## Post-Design Constitution Check

- **P1**: PASS. Tasks include failing tests before implementation tasks.
- **D1/D2**: PASS. Design keeps MCP orchestration in Distribution and uses exported contracts from other BCs.
- **M1-M3**: PASS. Design requires tenant context for every prompt/governance/chain/usage/audit operation and not-found-compatible denial for inaccessible resources.
- **S1-S3**: PASS. Contract explicitly forbids raw API key logging and response inclusion.
- **C1-C2**: PASS. `sh-run` audit/usage write is part of the core tool contract.
- **G1**: PASS. Endpoint/tool execution includes core entitlement gate before tenant-scoped reads.
