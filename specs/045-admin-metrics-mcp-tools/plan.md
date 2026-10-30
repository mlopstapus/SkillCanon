# Plan: Admin & Metrics MCP Tools

- New `src/bcs/distribution/application/mcp-admin-tools.ts` holds the tool names, zod schemas, descriptions and handlers; `mcp-tools.ts` merges them into `MCP_TOOL_NAMES`/`toolInputSchemas`/`toolDescriptions` and dispatches. `McpToolError` moves to `mcp-errors.ts` to avoid an import cycle.
- Handlers wrap `createPolicy/updatePolicy/deletePolicy/listTeamPolicies`, `createObjective/updateObjective/deleteObjective/listTeamObjectives` (governance barrel), `getTeam` (identity-access) for the scope verifiers, and `getPromptUsageSummaryForOrganization` (distribution) for metrics, all inside `withTenantContext`, passing `ctx.auditContext`.
- Scope check: `ctx.caller.scopes` must include the required scope.
- Errors: governance/identity domain errors are mapped to `isError` in `invokeMcpTool`.
- Tests: Testcontainers tests in `mcp-admin-tools.test.ts` (CRUD, audit transport, scope refusal, non-admin refusal, metrics); characterization test updated. e2e: ui-walk's MCP step lists the new tools.
