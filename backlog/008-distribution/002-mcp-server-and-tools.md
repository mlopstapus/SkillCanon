---
epic: 008-distribution
feature: 002-mcp-server-and-tools
status: open
dependencies: ["backlog/002-identity-access/EPIC.md", "backlog/005-governance/EPIC.md", "backlog/006-prompt-registry/EPIC.md"]
---

# MCP Server & Tools

**Deprioritized as of the skill-sync design (`005-skill-sync-cli.md`)** — see Technical Notes. Left `status: open` because it's still valid future work if a non-skill-capable MCP client shows up wanting programmatic access, just no longer the next thing to build in this epic.

**Status check (2026-08-05):** despite being "deprioritized, not the next thing to build," this was actually built anyway — `src/app/mcp/route.ts`, `src/bcs/distribution/application/{mcp-tools.ts,mcp-session.ts}` implement all six tools, bearer auth via `authDb`, and `sh-run` does call `withAudit()`/`record()` and `recordPromptUsage()`. `specs/001-mcp-server-tools/tasks.md` shows 39/39 checked. **But**: 7 of those "done" tasks (T017/T018/T022/T023/T026/T030/T034) cite `mcp-tools.test.ts` as where sh-context/sh-run/workflow-run behavior, the audit guarantee, and the "no raw key in logs" requirement are verified — that file does not exist anywhere in this repo's git history. Only `mcp-session.test.ts` (7 tests, session state only) and `mcp-tool-characterization.test.ts` (5 tests, tool name/schema shape only) and `route.test.ts` (2 auth-rejection tests) actually run. This item stays `open` — not because the code is missing, but because this feature's own Acceptance Criteria below (characterization equivalence, the audit-event guarantee, the no-raw-key-in-logs guarantee) are unverified by test despite the tasks file's claim. Close the gap (write the missing test file, or fix the false-claim tasks.md) before ever marking this `done`.

**Gap-closing plan (2026-08-05), from reading `mcp-tools.ts` directly:** `src/bcs/distribution/application/mcp-tools.ts` exports `shList`/`shSearch`/`shContext`/`shRun`/`shWorkflowList`/`shWorkflowRun` (each `(args, ctx: McpToolContext) => Promise<string>`, `ctx` = `{ db, caller, sessionId, auditContext, sessionManager? }`) plus `invokeMcpTool(name, args, ctx)` as the dispatch entry point actually wired into `route.ts`. None of these six functions are ever called by an existing test — `mcp-tool-characterization.test.ts` only asserts on the static `MCP_TOOL_NAMES`/`toolInputSchemas`/`parseLegacyInput`/`textResult` exports, never invokes a tool body. A new `mcp-tools.test.ts` (Testcontainers-backed, same pattern as this BC's other `application/*.test.ts` files) needs to cover, per tool:

- `shList`/`shSearch`: seed 2+ prompts (one matching a search query, one not), call the function directly with a real `db`/`withTenantContext`-wrapped fixture, assert the returned string lists/omits the right prompt names — not just that the function doesn't throw
- `shContext`: seed a policy and an objective at the caller's team, call `shContext`, assert both appear in the returned text (inherited vs. local sections); also cover the `project_id` argument path and its invalid-UUID error string
- `shRun`: the highest-value gap — seed a real prompt + published version, call `shRun`, then **query `audit.audit_events` directly** (raw SQL per this repo's established cross-BC test pattern, not an import of audit-compliance's internals) and assert exactly one `prompt.expanded` event was written with the right `resourceId`/`actorUserId` — this is the literal tenet C1 gap the feature's own Acceptance Criteria calls out and the one most likely to have silently regressed
- `shWorkflowList`/`shWorkflowRun`: seed a chain-kind prompt version, assert it appears in the workflow list (and a non-chain prompt does not), and that `shWorkflowRun` returns the expected `runId`/`pendingStep` shape from a real `startSkillChainRun` call
- **No-raw-key-in-logs**: `route.test.ts`'s existing test only checks the HTTP *response body* never contains the raw key — it does not check log output. Needs a test that spies/captures whatever logger this route path uses (`src/shared/logging`, per this repo's established `getLogger(bc)` pattern) across a real tool invocation and asserts no log line contains the raw key or its prefix — matching the same rigor already applied to the response-body check
- `maybeInjectSessionContext`'s "first call in a session gets the context block, subsequent calls don't" behavior (referenced by tasks.md's T018/T022) is also currently unverified against a real tool call — `mcp-session.test.ts` only tests `McpSessionManager` in isolation, never through `shList`/`shRun` etc.

Once this file exists and passes, either flip this item to `status: done` (if `specs/001-mcp-server-tools/tasks.md`'s claims turn out accurate) or correct both the tasks.md task descriptions and this file's Acceptance Criteria to match whatever gaps the new tests actually surface — don't force tasks.md's checkmarks to stay as-is if the new tests reveal one of T017/T018/T022/T023/T026/T030/T034's claims was simply wrong, not just untested.

Port the MCP server and all six tools from the current Python `mcp/server.py`, `mcp/session.py`, `mcp/tools.py`, using the official `@modelcontextprotocol/sdk` TS SDK running in-process in the Next.js app, per the architecture's assumption. This is a strict compatibility port — tool names and argument shapes are a public contract every connected IDE's config already depends on.

## Requirements

- [ ] MCP server mounted at `/mcp`, Streamable HTTP transport, bearer-authenticated via `authenticateApiKey` — **called with `shared/db/client.ts`'s `authDb`, never the ordinary `db`** — see `backlog/002-identity-access/008-authdb-consumer-handoff.md` and `bcs/identity-access/CONTRACT.md`'s per-function notes (011-tenant-isolation-rls)
- [ ] All six tools ported with identical names and argument shapes: `sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`
- [ ] Session state (resolved `userId` cache, "context already delivered" flag) implemented in-memory per process, per PDR-008 — ephemeral, safe to lose on restart
- [ ] `sh-run` calls `withAudit()` for every expansion — closing the gap tenet C1 explicitly calls out (current Python `sh_run` never calls `record_usage`, unlike the REST `/expand` path)
- [ ] Session-context auto-injection (policies/objectives block on first call per session) matches current behavior exactly

## Acceptance Criteria

- [ ] Each tool produces output equivalent to the current Python implementation for equivalent input (characterization-style comparison)
- [ ] `sh-run` produces an audit event for every call — verified by test, closing the tenet C1 gap
- [ ] No log statement in this feature includes any portion of a raw API key (tenet S3 — the specific gap called out in the tenets doc for `mcp/tools.py`)
- [ ] A process restart mid-session causes at most one extra API-key validation round trip, not a broken session (per PDR-008)

## Open Questions

- None — behavior fully specified by the existing Python implementation and the architecture's PDR-008 session-state decision.

## Dependencies

- All five prior bounded-context epics (002, 003, 004, 005, 006)

## Technical Notes

Per `bcs/distribution/CONTRACT.md`'s Breaking Change Policy, any deviation in tool name or argument shape from the current implementation is a breaking change to every user's existing MCP config — treat this feature as a strict compatibility port, not a redesign opportunity, even where the new architecture might suggest a cleaner tool shape. Directly closes the tenet C1 and S3 gaps the tenets document explicitly calls out by name.

**Deprioritization rationale:** `005-skill-sync-cli.md` makes governed prompts show up as native Claude Code skills via a plain REST call (`/prompts/expand/{name}`, already planned in `001-rest-api-core-routes.md`) instead of requiring the IDE to be configured as an MCP client. The reliability problem this was meant to solve — an agent deciding to call the right tool — turned out to be about invocation UX, not transport: a Skill is matched deterministically by name/description, an MCP tool call is not. For an IDE that doesn't support skills, standing up an MCP server doesn't obviously help either, since the same tool-selection reliability problem remains. This feature stays on the backlog for if/when a concrete non-skill-capable MCP client actually needs programmatic access (or for `sh-workflow-run`'s multi-step orchestration, which `005` does not attempt to replace), but `005-skill-sync-cli.md` is the priority now.
