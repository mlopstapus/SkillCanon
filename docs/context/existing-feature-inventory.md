# Existing Feature Inventory (Current Python/Next.js App)

**Last updated:** 2026-07-21
**Purpose:** A complete inventory of what the current app actually does — every REST route, MCP tool, and frontend page — pulled directly from the code (`backend/src/skillcanon_server/routers/*.py`, `mcp/tools.py`, `frontend/src/app/*`), not from memory or the architecture docs. Cross-referenced against `backlog/` to confirm the refactor epics (002–007) have a home for every existing capability before any old code is retired.

Each row maps to the bounded context epic that owns the port, and flags anything the backlog didn't originally account for.

## Identity & Access (→ `backlog/002-identity-access/`)

| Capability | Current route(s) | Backlog coverage |
|---|---|---|
| Org bootstrap status | `GET /auth/status` | 001-organization-tenant-model |
| Admin registration (creates org + root team + admin) | `POST /auth/register` | 001-organization-tenant-model |
| Login | `POST /auth/login` | 004-jwt-session-auth |
| Current user | `GET /auth/me` | 004-jwt-session-auth |
| Team CRUD + list | `POST/GET/PUT/DELETE /teams`, `/teams/{id}` | 002-team-hierarchy |
| **Insert team between an existing team and its parent** | `POST /teams/insert-between/{child_team_id}` | ⚠️ **Not in original feature requirements — see fix below** |
| User CRUD + list | `POST/GET/PUT/DELETE /users`, `/users/{id}` | 003-user-accounts-and-registration |
| Create/list/revoke invitation | `POST/GET/DELETE /auth/invitations` | 005-invitations |
| Get invitation by token, accept invitation | `GET /auth/invitations/token/{token}`, `POST /auth/invitations/{token}/accept` | 005-invitations |
| API key create/list/revoke | `POST/GET/DELETE /api-keys` | 006-api-keys |

## Governance (→ `backlog/005-governance/`)

| Capability | Current route(s) | Backlog coverage |
|---|---|---|
| Policy CRUD | `POST/GET/PUT/DELETE /policies`, `/policies/{id}` | 001-policy-model-and-crud |
| Effective policies (resolved, inherited+local) | `GET /policies/effective` | 003-hierarchical-resolution-engine |
| Objective CRUD | `POST/GET/PUT/DELETE /objectives`, `/objectives/{id}` | 002-objective-model-and-crud |
| Effective objectives | `GET /objectives/effective` | 003-hierarchical-resolution-engine |
| Project-scoped objective list/create (nested under `/projects/{id}/objectives`) | `GET/POST /projects/{project_id}/objectives` | Covered by 002-objective-model-and-crud's `project_id` scoping — routing shape (nested under Projects vs. flat) is a `000-foundations/004-api-and-error-conventions` decision, not a missing capability |

## Prompt Registry (→ `backlog/006-prompt-registry/`)

| Capability | Current route(s) | Backlog coverage |
|---|---|---|
| Project CRUD + list | `POST/GET/PUT/DELETE /projects`, `/projects/{id}` | 001-project-model-and-membership |
| Project member add/list/remove | `POST/GET/DELETE /projects/{id}/members` | 001-project-model-and-membership |
| Prompt create/list/get/delete | `POST/GET/DELETE /prompts`, `/prompts/{name}` | 002-prompt-and-version-model |
| Publish new version | `PUT /prompts/{name}` | 002-prompt-and-version-model |
| List versions | `GET /prompts/{name}/versions` | 002-prompt-and-version-model |
| **Rollback to a previous version (repoints `active_version_id`, does not edit version content)** | `POST /prompts/{name}/rollback/{version}` | ⚠️ **Not in original feature requirements — see fix below** |
| Expand (latest or pinned version) | `POST /expand/{name}`, `POST /expand/{name}/versions/{version}` | 004-expansion-engine |
| Share/list/revoke share | `POST/GET/DELETE /prompts/{name}/shares` | 003-prompt-sharing |

## Workflow Orchestration (→ `backlog/007-workflow-orchestration/`, since retired — see note below)

> **Update 2026-08-01**: Epic 007 was retired per [PDR-017](../pdr/017-fold-workflow-orchestration-into-prompt-registry.md) — a "workflow" is a `PromptVersion` whose content is a step list, not a separate bounded context. The capabilities below now live in `006-prompt-registry/009-skill-chains.md` (built) and `006-prompt-registry/010-skill-chain-views-ui.md` (UI, not yet built); workflow sharing (row 3 below) is satisfied with zero new code by the existing `subscribeSkill`/`forkSkill`. This table is left as-is below as the historical snapshot it was when written, not updated route-by-route.

| Capability | Current route(s) | Backlog coverage |
|---|---|---|
| Workflow CRUD + list | `POST/GET/PUT/DELETE /workflows`, `/workflows/{id}` | 001-workflow-model-and-crud |
| Run workflow | `POST /workflows/{id}/run` | 002-workflow-runner |
| **Share/list/revoke workflow share (`WorkflowShare` model exists, mirrors Prompt sharing)** | `POST/GET/DELETE /workflows/{id}/shares` | ⚠️ **Missing entirely from epic 007 — see fix below** |

## Distribution (→ `backlog/008-distribution/`)

| Capability | Current route(s) / tool(s) | Backlog coverage |
|---|---|---|
| Dashboard metrics | `GET /metrics/dashboard` | 004-usage-telemetry (extend to cover the dashboard aggregate, not just raw event recording) |
| MCP: list prompts | `sh-list` | 002-mcp-server-and-tools |
| MCP: search prompts | `sh-search` | 002-mcp-server-and-tools |
| MCP: show effective policies/objectives | `sh-context` | 002-mcp-server-and-tools |
| MCP: expand/run a prompt | `sh-run` | 002-mcp-server-and-tools |
| MCP: list workflows | `sh-workflow-list` | 002-mcp-server-and-tools |
| MCP: run a workflow | `sh-workflow-run` | 002-mcp-server-and-tools |

## Frontend pages (current `frontend/src/app/*`, all → `008-distribution/003-web-ui-shell-and-core-pages`)

`login`, `register`, `welcome`, `invite/[token]`, `projects` (list + `[id]` detail), `prompts` (list + `[name]` detail + `new`), `workflows` (list + `[id]` detail + `new`), `teams`, `settings`, `metrics`. All accounted for under the one UI feature — no gaps found here beyond the general "audit page-by-page at implementation time" note already in that feature file.

## Gaps found and fixed in the backlog

Three capabilities exist in the current app but were missing (or not fully specified) in the original backlog pass. All three are now corrected directly in the relevant feature files:

1. **Team "insert between"** — added to `002-identity-access/002-team-hierarchy.md`'s requirements.
2. **Prompt version rollback** (`active_version_id` repoint, not version editing — doesn't conflict with version immutability) — added to `006-prompt-registry/002-prompt-and-version-model.md`'s requirements.
3. **Workflow sharing** (`WorkflowShare`, mirrors `PromptShare`) — was missing entirely from epic 007; added as a new feature `007-workflow-orchestration/004-workflow-sharing.md`.

No other gaps were found — every other current route, MCP tool, and frontend page has a clear home in the existing epic/feature breakdown.
