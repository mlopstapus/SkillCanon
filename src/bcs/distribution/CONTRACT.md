# Distribution — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

The interface/adapter layer — REST route handlers, the MCP protocol server (`sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`), and the web UI's server actions. Has no domain rules of its own: it authenticates the caller (via Identity), resolves the org/user/project context, calls the appropriate domain context's application service, formats the response for HTTP or MCP, and records usage telemetry. Every other context is a supplier to this one; this context supplies nothing back except the composed external surface.

## Exposed APIs

This is the system's actual external boundary — everything below is public:

| Surface | Description |
|---|---|
| REST API (`/api/...`) | CRUD and runtime routes used by the web UI, direct REST clients, and Skill Sync CLI |
| `POST /api/skills/{name}/expand` | Authenticated genuine skill expansion. Records one `PromptUsage` row for each visible template-skill invocation, including success/failure status, latency, optional project/user context, and optional git context supplied by Skill Sync CLI. Preview/test code paths do not call this route and do not record usage. |
| `POST /api/chain-runs/{runId}/advance` | Authenticated skill-chain step report. Records one `PromptUsage` row for each accepted completed/failed terminal step report. Invalid, stale, abandoned, or unreported steps do not fabricate usage. |
| `GET /api/metrics` | Authenticated organization-scoped aggregate usage: totals, status counts, skill/version breakdowns, latency summaries, and daily counts for a bounded window. |
| MCP endpoint (`/mcp`) | Streamable HTTP MCP server, bearer-authenticated via API key. MCP usage parity is deferred; if `sh-run` is revised later, it must use the same telemetry semantics as REST expansion. |
| Web UI (`src/app/(app)/**`) | Next.js pages, session-cookie authenticated. `/metrics` presents the same organization-scoped aggregate data as `/api/metrics`. |
| GitHub webhook (`/api/webhooks/github`) | Thin route handler — verifies nothing itself, forwards raw body/headers straight into VCS Integration's `handleGithubWebhook()`. Owned here per `repo-structure.md`'s rule that all `src/app/api/**` route files belong to Distribution, even when the domain logic behind them belongs to another BC. |

In addition to the external surface above, Distribution exposes internal, cross-BC read/write functions:

| Method | Description | Consumers |
|---|---|---|
| `recordPromptUsage(db, params)` | Inserts one telemetry row. Required params are `organizationId`, `promptId`, and `promptVersionId`; optional params include `promptVersion`, `projectId`, `userId`, `statusCode`, `latencyMs`, `gitRemoteUrl`, `gitBranch`, and `gitCommitSha`. No audit write — usage telemetry is explicitly distinct from compliance audit logging. | Distribution REST/MCP route handlers; tests and fixture setup |
| `getPromptUsageSummaryForProject(db, orgId, projectId, { activeWindowDays, trendDays })` | Returns project-scoped `{ totalInvocations, windowRows, bySkill, byMember, dailyCountsBySkill }`, every internal query scoped by both `orgId` and `projectId`. | Prompt Registry project metrics composition |
| `getPromptUsageSummaryForOrganization(db, orgId, { window })` | Returns organization-scoped totals, success/failure counts, latency summaries, status counts, skill/version breakdowns, and daily counts for the requested bounded window. | `/api/metrics`, `/metrics` |
| `queryUsageByRepoAndCommits(orgId, gitRemoteUrl, commitShas[])` | Planned VCS Integration read side for rows whose `git_remote_url` matches and `git_commit_sha` is in the supplied list. | VCS Integration |

## Events Published

None domain-relevant — this context terminates external requests rather than starting domain event chains.

## Events Consumed

No event bus infrastructure exists in this codebase. Telemetry is written directly by whichever Distribution route represents genuine usage. Prompt Registry remains the supplier of expansion/chain data; it does not import Distribution telemetry internals.

## Data Contracts

`PromptUsage` (`distribution.prompt_usage`) columns after `001-usage-telemetry`:

- `id`
- `organization_id`
- `prompt_id`
- `prompt_version_id`
- `prompt_version`
- nullable `project_id`
- nullable `user_id`
- `status_code`
- nullable `latency_ms`
- nullable `git_remote_url`
- nullable `git_branch`
- nullable `git_commit_sha`
- `created_at`

Rows store identifiers, status, latency, and optional runtime context only. They never store rendered prompt content, raw input, raw error details, API keys, JWTs, or secrets.

## Stability Guarantees

MCP tool names and argument shapes are a public contract to every connected IDE; changing them is a breaking change to every user's existing MCP config, not just an internal refactor. `PromptUsage` rows carrying a non-null `git_commit_sha` are retained at least 90 days regardless of any general telemetry rollup policy — see [PDR-015](../../../docs/pdr/015-prompt-usage-retention-floor.md); this is no longer freely truncatable data.

## Breaking Change Policy

Any MCP tool rename/signature change requires a deprecation window (old tool continues working, logs a warning) before removal, and a PDR.
