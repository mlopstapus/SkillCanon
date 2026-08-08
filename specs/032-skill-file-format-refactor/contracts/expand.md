# Contract: `expand()` / `POST /api/skills/[name]/expand` / MCP `sh-run`

## `expand()` (`src/bcs/prompt-registry/application/expand.ts`)

**Before**:
```ts
expand(db, { organizationId, promptName, input, userId?, projectId?, version? })
  → { systemMessage: string | null, userMessage: string, appliedPolicies: string[], objectives: string[] }
```

**After**:
```ts
expand(db, { organizationId, promptName, userId?, projectId?, version? })
  → { content: string, appliedPolicies: string[], objectives: string[] }
```

- `content` is never null (a template-kind version always has non-empty resolvable content — either its new-shape main file or its legacy system+user composition).
- Same error behavior: `ExpansionSourceNotFoundError` for a nonexistent/unpublished/deprecated skill, or a `kind: "chain"` version (unchanged — chain versions are still rejected the same way).

## `POST /api/skills/[name]/expand`

**Request body — before**:
```jsonc
{ "input": { /* record */ }, "version": "1", "projectId": "...", "gitRemoteUrl": null, "gitBranch": null, "gitCommitSha": null }
```

**Request body — after**: same, minus `input`.
```jsonc
{ "version": "1", "projectId": "...", "gitRemoteUrl": null, "gitBranch": null, "gitCommitSha": null }
```

**Response body — before**: `{ systemMessage, userMessage, appliedPolicies, objectives }`
**Response body — after**: `{ content, appliedPolicies, objectives }`

Usage-telemetry recording (`recordPromptUsage`) is unaffected — it records against the resolved version's identity, not the response shape.

## MCP `sh-run`

**Input schema — before**: `{ name, input: string, project?: string }`
**Input schema — after**: `{ name, project?: string }` — `input` removed.

**Output text — before**:
```
[System]
<systemMessage>

[User]
<userMessage>

[Policies Applied]
<comma-separated policy names>
```

**Output text — after**:
```
<content>

[Policies Applied]
<comma-separated policy names>
```

(The `[Policies Applied]` block is omitted when `appliedPolicies` is empty, same as today.)
