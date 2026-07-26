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

In addition to the external surface above, Distribution exposes one internal, cross-BC read function (not part of the REST/MCP/UI boundary):

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `queryUsageByRepoAndCommits(orgId, gitRemoteUrl, commitShas[])` | **New (011-vcs-integration).** Returns `PromptUsage` rows whose `git_remote_url` matches and `git_commit_sha` is in the given list — the read side of the CLI-side git tagging in [PDR-013](../../../docs/pdr/013-cli-side-git-context-tagging.md). | VCS Integration |

## Events Published

None domain-relevant — this context terminates event chains rather than starting them (it triggers writes in other contexts, which publish their own events).

## Events Consumed

| Event | From BC | What this BC does with it |
|---|---|---|
| `PromptExpanded` | Prompt Registry | Writes a `PromptUsage` telemetry row (status, latency, prompt/version) |
| `WorkflowRunCompleted` / `WorkflowRunFailed` | Workflow Orchestration | Writes `PromptUsage` rows per step |

## Data Contracts

MCP tool request/response shapes match the current tool set 1:1 (`sh-list`, `sh-search`, `sh-context`, `sh-run`, `sh-workflow-list`, `sh-workflow-run`) — this is a deliberate compatibility guarantee, since existing IDE configs point at these tool names.

`PromptUsage` (the `distribution.prompt_usage` table) gains three new nullable columns as of 011-vcs-integration: `gitRemoteUrl`, `gitBranch`, `gitCommitSha`, populated by the `skillcanon` CLI when it invokes the expand endpoint from inside a real git repo (null otherwise — e.g. web UI invocations). See [PDR-013](../../../docs/pdr/013-cli-side-git-context-tagging.md).

## Stability Guarantees

MCP tool names and argument shapes are a public contract to every connected IDE; changing them is a breaking change to every user's existing MCP config, not just an internal refactor. `PromptUsage` rows carrying a non-null `gitCommitSha` are retained at least 90 days regardless of any general telemetry rollup policy — see [PDR-015](../../../docs/pdr/015-prompt-usage-retention-floor.md); this is no longer freely truncatable data.

## Breaking Change Policy

Any MCP tool rename/signature change requires a deprecation window (old tool continues working, logs a warning) before removal, and a PDR.
