# Data Model: Usage Telemetry

## PromptUsage

Telemetry record owned by Distribution. One row represents one genuine runtime usage event that reached a known organization and visible skill/version.

Fields:

- `id`: UUID primary key
- `organizationId`: UUID tenant identifier, required
- `promptId`: UUID invoked skill identifier, required
- `promptVersionId`: UUID invoked skill version identifier, required when the version ID is known
- `promptVersion`: string version label captured at invocation time, required for aggregate display and chain-step telemetry
- `projectId`: nullable UUID project context
- `userId`: nullable UUID acting user
- `statusCode`: integer HTTP-like outcome code, required for new runtime telemetry; existing historical rows may default to `200`
- `latencyMs`: integer elapsed time in milliseconds, nullable when not measurable
- `gitRemoteUrl`: nullable string CLI git remote context
- `gitBranch`: nullable string CLI git branch context
- `gitCommitSha`: nullable string CLI git commit context
- `createdAt`: immutable timestamp with timezone

Validation:

- `organizationId`, `promptId`, `promptVersionId`, and `createdAt` are required.
- Optional context stays null when absent; it is never guessed.
- No rendered prompt content, raw input, raw errors, API keys, JWTs, or secrets are stored.

## UsageStatus

Outcome semantics are stored as `statusCode`:

- REST expansion success: `200`
- REST expansion failure after a visible skill/version is known: the mapped API status, such as `422` or `500`
- Skill-chain step success: `200`
- Skill-chain step failed terminal report: `500`

Metrics can group status codes directly and derive success/error buckets from the code family.

## MetricsAggregate

Read model returned by `getPromptUsageSummaryForOrganization()` and `/api/metrics`.

Fields:

- `totalInvocations`
- `successCount`
- `failureCount`
- `averageLatencyMs`
- `p95LatencyMs`
- `bySkill`: `promptId`, optional display `promptName`, `promptVersionId`, `promptVersion`, `runCount`, `successCount`, `failureCount`, `averageLatencyMs`, `lastUsedAt`
- `byStatus`: `statusCode`, `runCount`
- `dailyCounts`: `day`, `count`

Rules:

- Every query filters by `organizationId`.
- `from`/`to` windows are bounded server-side; omitted windows use a default recent window.
- Empty organizations return zero counts and empty arrays.
