# Contract: MCP Server & Tools

## Endpoint

`/mcp`

- Transport: MCP Streamable HTTP using the official TypeScript SDK.
- Authentication: `Authorization: Bearer <api-key>`.
- Credential lookup: `authenticateApiKey(authDb, rawKey)` only.
- Entitlement gate: `assertCoreFeaturesEnabled()` before tenant-scoped reads or writes.
- Tenant context: all tenant-scoped operations execute inside `withTenantContext(db, caller.organizationId, ...)`.

## Tool Discovery

Discovery MUST expose exactly:

- `sh-list`
- `sh-search`
- `sh-context`
- `sh-run`
- `sh-workflow-list`
- `sh-workflow-run`

No additional public MCP tools are part of this feature.

## Tool Schemas

### `sh-list`

Arguments: none.

Returns text:

- Empty: `No prompts registered yet.`
- Non-empty:

```text
Available prompts:
  - <name>
```

### `sh-search`

Arguments:

- `query`: string, required

Returns text:

- No match: `No prompts matching '<query>'.`
- Matches:

```text
Prompts matching '<query>':
  - sh-<name>: <description or No description> [tags: <comma-tags or none>]
```

### `sh-context`

Arguments:

- `project_id`: string UUID, optional

Returns text:

- Invalid project UUID: `Error: invalid project_id UUID.`
- Invalid unresolved caller: `Error: could not resolve user from API key. Ensure a valid Bearer token is set.`
- Success:

```text
=== Effective Policies ===
Inherited (immutable):
  - [<type>] <name>: <content-prefix>
Local (mutable):
  - [<type>] <name>: <content-prefix>

=== Effective Objectives ===
Inherited (immutable):
  - <title>
Local (mutable):
  - <title>
```

When a section has no rows, include `  (none)`.

### `sh-run`

Arguments:

- `name`: string, required
- `input`: string, required; JSON object strings are parsed as template vars, all other values become `{ input: <original string> }`
- `project`: string UUID, optional; invalid UUID is ignored, matching legacy behavior

Returns text:

- Inaccessible prompt: `Error: prompt '<name>' not found or not shared with you.`
- Unresolvable prompt: `Error: prompt '<name>' not found.`
- Success:

```text
[System]
<system-message>

[User]
<user-message>

[Policies Applied]
<comma-separated policy names>
```

The `[System]` block is omitted when absent. The `[Policies Applied]` block is omitted when empty.

Side effects:

- Exactly one audit event for successful expansion.
- Exactly one prompt usage row for successful expansion.

### `sh-workflow-list`

Arguments: none.

Returns text:

- Empty: `No workflows found.`
- Non-empty:

```text
Available workflows:
  - <name> (<step-count> step[s])<optional description>
```

Implementation maps workflows to accessible chain-kind skills.

### `sh-workflow-run`

Arguments:

- `name`: string, required
- `input`: string, required; parsed with the same legacy JSON-object-or-plain-string rule as `sh-run`

Returns text:

- Not found: `Error: workflow '<name>' not found.`
- Failed start/run: `Error: failed to run workflow '<name>'.`
- Success uses legacy-compatible workflow text format:

```text
Workflow: <workflow-name> (<step-count> steps)

--- <status-icon> <step-id> (<prompt-name> v<prompt-version>) ---
...

--- Final Outputs ---
<pretty-json-output>
```

## Session Context Injection

Before a successful or handled tool text response, prepend the session context block only if `contextDelivered` is false and the caller can be resolved:

```text
═══ SESSION CONTEXT (auto-injected) ═══

Policies:
  - [<type>] <name>: <content-prefix> (<scope>)

Objectives:
  - <title> — <description-prefix>

═══════════════════════════════════════
```

If no policies or objectives exist, use `(none configured)` lines. After injection is attempted for a session, set `contextDelivered = true`.

## Security and Logging

- Missing/invalid bearer credentials return MCP/HTTP unauthenticated behavior before tenant reads.
- Logs MUST NOT include any substring, prefix, suffix, hash, or display prefix derived from the raw API key.
- Responses MUST NOT echo raw credentials.
- Cross-tenant probes return not-found-compatible messages.
