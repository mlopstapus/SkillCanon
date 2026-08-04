# Data Model: MCP Server & Tools

No durable schema changes are required. The feature composes existing Identity & Access, Governance, Prompt Registry, Distribution usage, and Audit Compliance data.

## MCP Session State

Ephemeral in-memory record keyed by MCP session id or request-derived session key.

- `sessionId`: opaque string key
- `caller`: nullable resolved caller summary
  - `userId`
  - `organizationId`
  - `teamId`
  - `role`
  - `email`
- `contextDelivered`: boolean, initially `false`
- `createdAt`: Date
- `lastSeenAt`: Date

Validation rules:

- MUST NOT store raw API keys.
- MUST NOT be required for correctness.
- If missing, caller identity is re-resolved from the bearer API key.
- If lost on restart, `contextDelivered` resets and one extra context block is acceptable.

## MCP Tool Definition

Static public contract exposed by tool discovery.

- `name`: one of `sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`
- `description`: legacy-compatible tool description
- `inputSchema`: legacy-compatible JSON schema inferred from arguments

Validation rules:

- Tool set MUST contain exactly the six public names.
- Argument names and required/optional status MUST match legacy:
  - `sh-list`: no public args
  - `sh-search`: `query: string`
  - `sh-context`: optional `project_id: string`
  - `sh-run`: `name: string`, `input: string`, optional `project: string`
  - `sh-workflow-list`: no public args
  - `sh-workflow-run`: `name: string`, `input: string`

## MCP Tool Invocation

One authenticated request to run a public tool.

- `toolName`
- `arguments`
- `caller`
- `sessionState`
- `sourceIp`
- `resultText` or handled error text

Validation rules:

- Missing/invalid bearer credentials fail before tenant-scoped reads.
- Unknown tools fail through MCP protocol handling without internal route disclosure.
- Malformed public arguments fail validation before partial work.
- Inaccessible prompts/chains return not-found-compatible legacy messages.

## Session Context Block

Legacy-formatted policy/objective block prepended once per session to the first applicable tool response.

- `policies`: effective inherited + local policies for caller
- `objectives`: effective inherited + local objectives for caller
- `format`: text beginning with `═══ SESSION CONTEXT (auto-injected) ═══`

Validation rules:

- Delivered at most once per uninterrupted in-memory session.
- Uses caller-scoped governance resolution only.
- Does not mark durable state.

## Prompt Expansion Audit/Usage

Durable records created for `sh-run` prompt expansion.

- Audit event:
  - `organizationId`
  - `actorUserId`
  - `action`: `prompt.expanded`
  - `resourceType`: `prompt`
  - `resourceId`: expanded prompt id/version context
  - `transport`: `api`
  - `sourceIp`
  - `after`: non-secret metadata such as prompt name/version/project id
- Prompt usage:
  - `organizationId`
  - `promptId`
  - `promptVersionId`
  - `projectId`
  - `userId`

Validation rules:

- Exactly one audit event and one usage row per successful expansion.
- No raw prompt input secrets or API keys are stored in audit metadata.
- If audit/usage persistence fails, the expansion request fails rather than silently succeeding without evidence.
