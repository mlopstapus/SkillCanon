# Distribution — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

The interface/adapter layer — REST route handlers, the MCP protocol server (`sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`), and the web UI's server actions. Has no domain rules of its own: it authenticates the caller (via Identity), resolves the org/user/project context, calls the appropriate domain context's application service, formats the response for HTTP or MCP, and records usage telemetry. Every other context is a supplier to this one; this context supplies nothing back except the composed external surface.

## Exposed APIs

This is the system's actual external boundary — everything below is public:

| Surface | Description |
|---|---|
| REST API (`/api/v1/...`) | Full CRUD over teams, projects, prompts, policies, objectives, workflows, api-keys — used by the web UI |
| MCP endpoint (`/mcp`) | Streamable HTTP MCP server, bearer-authenticated via API key, tools listed above |
| Web UI (`/app/...`) | Next.js pages, session-cookie authenticated |
| GitHub webhook (`/api/webhooks/github`) | **New (011-vcs-integration).** Thin route handler — verifies nothing itself, forwards raw body/headers straight into VCS Integration's `handleGithubWebhook()`. Owned here per `repo-structure.md`'s rule that all `src/app/api/**` route files belong to Distribution, even when the domain logic behind them belongs to another BC. |

In addition to the external surface above, Distribution exposes internal, cross-BC read/write functions (not part of the REST/MCP/UI boundary):

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `queryUsageByRepoAndCommits(orgId, gitRemoteUrl, commitShas[])` | **New (011-vcs-integration).** Returns `PromptUsage` rows whose `git_remote_url` matches and `git_commit_sha` is in the given list — the read side of the CLI-side git tagging in [PDR-013](../../../docs/pdr/013-cli-side-git-context-tagging.md). | VCS Integration |
| `recordPromptUsage(db, { organizationId, promptId, promptVersionId, projectId?, userId? })` | **New (024-project-usage-metrics-dashboard, pulled forward from `008-distribution/004-usage-telemetry.md`).** Inserts one `PromptUsage` row. No audit write — usage telemetry is explicitly distinct from the audit trail. Not called by any production code path yet: no genuine (non-test) caller of `expand()` exists anywhere in the codebase, and the prompt detail page's live-preview/test flow must never call this (spec FR-002a) — tests call it directly to seed fixtures. | Prompt Registry (tests only, for now) |
| `getPromptUsageSummaryForProject(db, orgId, projectId, { activeWindowDays, trendDays })` | **New (024-project-usage-metrics-dashboard).** Returns `{ totalInvocations, windowRows, bySkill, byMember, dailyCountsBySkill }` for one project, every internal query scoped by both `orgId` and `projectId`. `prompt-registry`'s `getProjectMetrics` composes this with its own project/member/skill-requirement data. | Prompt Registry |

## Events Published

None domain-relevant — this context terminates event chains rather than starting them (it triggers writes in other contexts, which publish their own events).

## Events Consumed

| Event | From BC | What this BC does with it |
|---|---|---|
| `PromptExpanded` | Prompt Registry | **Correction (024-project-usage-metrics-dashboard):** no event-bus infrastructure exists anywhere in this codebase — this row previously implied a real pub/sub subscription that was never built. In practice, a `PromptExpanded`-worthy invocation is recorded via a direct call to `recordPromptUsage` from whatever call site represents genuine usage, not a subscribed event handler. No such call site exists yet (see above) — this row documents intended future wiring once `008-distribution` provides a genuine invocation transport (CLI/REST/MCP), not current behavior. |
| `WorkflowRunCompleted` / `WorkflowRunFailed` | Workflow Orchestration | Writes `PromptUsage` rows per step — same caveat: no event bus exists, this is intended future direct-call wiring, not current behavior |

## Data Contracts

MCP tool request/response shapes match the current tool set 1:1 (`sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`) — this is a deliberate compatibility guarantee, since existing IDE configs point at these tool names.

`PromptUsage` (the `distribution.prompt_usage` table) was first created by `024-project-usage-metrics-dashboard` with columns `id`, `organizationId`, `promptId`, `promptVersionId`, nullable `projectId`, nullable `userId`, `createdAt` — deliberately diverging from `008-distribution/004-usage-telemetry.md`'s originally-planned `promptName`/`promptVersion` strings and `statusCode`/`latencyMs` columns (see that item's own Technical Notes for what's still open there). It gains three new nullable columns as of 011-vcs-integration: `gitRemoteUrl`, `gitBranch`, `gitCommitSha`, populated by the `skillcanon` CLI when it invokes the expand endpoint from inside a real git repo (null otherwise — e.g. web UI invocations). See [PDR-013](../../../docs/pdr/013-cli-side-git-context-tagging.md).

## Stability Guarantees

MCP tool names and argument shapes are a public contract to every connected IDE; changing them is a breaking change to every user's existing MCP config, not just an internal refactor. `PromptUsage` rows carrying a non-null `gitCommitSha` are retained at least 90 days regardless of any general telemetry rollup policy — see [PDR-015](../../../docs/pdr/015-prompt-usage-retention-floor.md); this is no longer freely truncatable data.

## Breaking Change Policy

Any MCP tool rename/signature change requires a deprecation window (old tool continues working, logs a warning) before removal, and a PDR.
