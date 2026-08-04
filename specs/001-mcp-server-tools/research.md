# Research: MCP Server & Tools

## Decision: Use the official TypeScript MCP SDK Streamable HTTP transport in a Next route handler

**Rationale**: The feature explicitly requires the official `@modelcontextprotocol/sdk` TypeScript SDK and Streamable HTTP. `npm view @modelcontextprotocol/sdk version` returned `1.30.0` on 2026-08-03. Keeping the transport adapter isolated in `src/app/mcp/route.ts` lets the Distribution BC own tool orchestration without coupling domain code to Next request details.

**Alternatives considered**: Hand-rolled JSON-RPC was rejected because the SDK owns protocol compatibility. A separate Node server was rejected because architecture assumes in-process Next composition.

## Decision: Resolve bearer identity with `authenticateApiKey(authDb, rawKey)` on cache miss

**Rationale**: Identity & Access documents `authDb` as the only correct DB client for pre-tenant credential lookup. The existing `resolveCaller()` function already follows this pattern for REST, but MCP needs bearer-only behavior and per-session cache semantics, so it will use the same underlying application function directly.

**Alternatives considered**: Reusing `resolveCaller()` wholesale was rejected because it allows cookie auth and returns API audit context; MCP compatibility requires bearer API keys. Calling `authenticateApiKey(db, rawKey)` was rejected by the spec and authDb handoff contract.

## Decision: Store MCP session state in a process-local map keyed by session id

**Rationale**: PDR-008 explicitly chooses ephemeral per-process session state. The state contains only the resolved caller and a `contextDelivered` flag. On restart or cache miss, the raw bearer key is revalidated; losing the map may cause one extra context block but cannot grant stale access.

**Alternatives considered**: Durable Redis/Postgres session storage was rejected as out of scope. Caching raw API keys was rejected by S3 and is unnecessary.

## Decision: Implement tool logic as Distribution application functions returning legacy-formatted text

**Rationale**: The six tools are a public distribution contract, and the existing TS application services already own prompt listing, governance resolution, prompt expansion, skill-chain execution, usage, and audit behavior. A Distribution `mcp-tools.ts` module can map legacy arguments and text formatting to those services while keeping route code thin.

**Alternatives considered**: Implementing each tool directly inside `route.ts` was rejected because it would blur transport and application orchestration. Porting legacy Python services mechanically was rejected because it would bypass existing TypeScript bounded-context contracts.

## Decision: Represent legacy workflow tools with skill-chain equivalents

**Rationale**: PDR-017 folds workflow orchestration into prompt-registry skill chains. `sh-workflow-list` will list accessible chain-kind skills with legacy workflow-list formatting, and `sh-workflow-run` will start the matching chain using the legacy `name`/`input` shape while preserving not-found-compatible errors.

**Alternatives considered**: Reintroducing a separate Workflow model was rejected because it conflicts with the current prompt-registry model and PDR-017.

## Decision: `sh-run` writes audit and usage in the same tenant-scoped transaction

**Rationale**: The spec calls out the legacy MCP path's audit gap. The implementation will resolve the expandable version, perform expansion, then record an audit event and prompt usage through `withAudit()`. Usage telemetry and audit are distinct records, but both must be attempted for an MCP expansion to complete.

**Alternatives considered**: Calling pure `expand()` alone was rejected because it repeats the known gap. Logging-only audit was rejected because SOC2 evidence must be durable.

## Decision: Never log raw API keys, including prefixes

**Rationale**: Legacy Python logged `api_key_raw[:12]`, which violates S3. MCP logging will include request path, session id presence, user/org ids after auth, tool name, status, duration, and error code only.

**Alternatives considered**: Logging masked prefixes was rejected because the constitution says no portion of the raw key, even truncated.
