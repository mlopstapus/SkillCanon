# Contract: Usage Telemetry

## REST

### `POST /api/skills/{name}/expand`

Existing response shape is unchanged. A genuine authenticated REST expansion writes exactly one `distribution.prompt_usage` row when the request reaches a visible template skill/version.

Request additions:

- `gitRemoteUrl?: string | null`
- `gitBranch?: string | null`
- `gitCommitSha?: string | null`

These optional fields are for the Skill Sync CLI. Web UI and direct REST callers may omit them.

Telemetry behavior:

- Success records `statusCode = 200` and measured `latencyMs`.
- Failure records the mapped status only when caller organization and skill/version are known.
- Unauthenticated requests and unknown/cross-org skills do not create cross-tenant-disclosing rows.

### `POST /api/chain-runs/{runId}/advance`

Existing response shape is unchanged. When the route accepts a terminal step report (`status: "success"` or `status: "error"`), it writes one usage row for that reported step.

Telemetry behavior:

- `status: "success"` records `statusCode = 200`.
- `status: "error"` records `statusCode = 500`.
- Abandoned runs and invalid/stale reports do not fabricate usage rows.

### `GET /api/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns organization-scoped aggregate usage for the authenticated caller.

Response:

```json
{
  "window": { "from": "2026-07-21T00:00:00.000Z", "to": "2026-08-04T23:59:59.999Z" },
  "totalInvocations": 3,
  "successCount": 2,
  "failureCount": 1,
  "averageLatencyMs": 120,
  "p95LatencyMs": 240,
  "byStatus": [{ "statusCode": 200, "runCount": 2 }],
  "bySkill": [
    {
      "promptId": "00000000-0000-0000-0000-000000000000",
      "promptName": "security-review",
      "promptVersionId": "00000000-0000-0000-0000-000000000001",
      "promptVersion": "1.0.0",
      "runCount": 2,
      "successCount": 2,
      "failureCount": 0,
      "averageLatencyMs": 120,
      "lastUsedAt": "2026-08-04T12:00:00.000Z"
    }
  ],
  "dailyCounts": [{ "day": "2026-08-04", "count": 2 }]
}
```

Errors:

- `401 UNAUTHENTICATED`
- `403 ENTITLEMENT_REQUIRED`
- `422 VALIDATION_FAILED`

## Page

### `GET /metrics`

Authenticated app-shell page showing the same aggregate data as `/api/metrics`: total invocations, success/failure counts, latency summaries, status breakdown, skill/version breakdown, and zero-usage state.

## Deferred MCP Contract

If the MCP `sh-run` transport is later implemented or revised, it must record rows with the same organization, skill, version, context, status, latency, and timestamp semantics as REST expansion. MCP parity tests are required at that time, not in this feature.
