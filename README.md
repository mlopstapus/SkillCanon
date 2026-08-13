# SkillCanon

An open-source, self-hosted skill/prompt registry with **hierarchical governance**, distributed via REST, [MCP](https://modelcontextprotocol.io/), and a CLI.

Define governed skills once, distribute them to every developer's AI tool as REST calls, MCP tools, or via the `skillcanon` CLI. Organizational policies and objectives are automatically applied during skill expansion. SkillCanon never calls an LLM itself — it resolves and serves governed skill content, and the caller's own LLM does the work.

## Key Features

- **Skill Registry** — versioned skills authored as a `SKILL.md` file plus optional supporting files (Nunjucks-templated), with tags, deprecation, sharing (subscribe/fork), and multi-step **skill chains**
- **Distribution** — REST API, an MCP server, and the `skillcanon` CLI (syncs a repo's local skill files with a project's governed roster and resolves skills live at invocation time)
- **Hierarchical Teams** — recursive team tree with users, enabling org-wide governance
- **Policy Enforcement** — policies (`prepend`/`append`/`inject`/`validate`) are automatically applied during skill expansion
- **Objective Tracking** — team, user, and project objectives are surfaced alongside expanded skills
- **Two-Layer Inheritance** — inherited (immutable from parent teams) + local (mutable at your level)
- **Projects** — team-owned, with cross-team members and required/optional skill assignments
- **User-Scoped API Keys** — authentication tied to users, usable for both REST and MCP
- **Skill Import** — bulk-import skills from a public GitHub source, or from a local folder already on disk (e.g. a repo's `.claude/skills/`)
- **Audit Log** — every mutation across the product is recorded to an immutable audit trail
- **Admin Dashboard** — Next.js web UI for managing teams, skills, policies, projects, and more

## Quickstart (docker-compose)

```bash
git clone https://github.com/mlopstapus/SkillCanon.git && cd SkillCanon

docker compose up -d
```

That builds and starts the whole self-hosted stack — the unified Next.js app (`app`, port 3000) and Postgres (`database`, port 5432). Postgres starts with no pre-baked schema; migrations run automatically as part of the app's own startup path via Drizzle.

- **Web app:** http://localhost:3000
- First visit redirects to first-run setup, which creates the initial organization, admin user, and team.

### Local dev (without Docker for the app)

```bash
pnpm install
docker compose up -d database   # Postgres only
pnpm db:migrate
pnpm dev
```

Requires Node `>=24` and `pnpm`. See `CLAUDE.md` for the full set of dev/lint/typecheck/test commands.

## Connect Your AI Tool

SkillCanon uses API keys for authentication, scoped to a user. Every request made with a key — REST or MCP — resolves that user's effective policies and objectives automatically.

### Step 1: Get Your API Key

Sign in to the web app and go to **Settings → API keys** (`/settings/api-keys`) to issue one. The key is shown once, in the form `sk_...` — save it immediately.

### Step 2: Use it

**Via the `skillcanon` CLI** (`cli/` — a standalone package, published separately):

```bash
npx skillcanon init <project-key> <api-key>   # one-time: links this repo to a SkillCanon project
npx skillcanon sync                            # pulls the project's governed skills into .claude/skills/
npx skillcanon run <slug>                      # resolves and prints one skill's current governed content
```

`init` also wires a Claude Code session-start hook, so a linked repo's skills stay in sync automatically.

**Via REST:**

```bash
curl -s -X POST https://your-host/api/skills/release-notes/expand \
  -H "Authorization: Bearer sk_YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "<project-uuid>"}'
```

Response:

```json
{
  "content": "the resolved skill markdown, with policy enforcement applied",
  "appliedPolicies": ["Always include unit tests"],
  "objectives": ["Ship the Q3 roadmap"]
}
```

**Via MCP** — point your MCP-compatible client at `/mcp` with the same bearer key:

```json
{
  "mcpServers": {
    "skillcanon": {
      "url": "https://your-host/mcp",
      "headers": { "Authorization": "Bearer sk_YOUR_API_KEY_HERE" }
    }
  }
}
```

Available tools: `sh-list` (list skills), `sh-search` (search by name/tag), `sh-context` (show effective policies/objectives for the caller), `sh-run` (run a skill by name).

## Governance Model

SkillCanon uses a recursive team hierarchy for governance:

```
Org (root team)
├── Engineering (child team)
│   ├── MLOps (grandchild team)
│   │   └── alice, bob (users)
│   └── carol (user)
└── Design (child team)
    └── dave (user)
```

**Policies** cascade down the tree. When Alice expands a skill:
1. Org policies → inherited (immutable)
2. Engineering policies → inherited (immutable)
3. MLOps policies → local (mutable)
4. If a project is specified → project policies added to local

**Objectives** follow the same pattern — inherited from above, appendable at your level, and may also be scoped directly to a project.

Every expansion response includes `appliedPolicies` and `objectives` so the caller (and user) can see exactly what governance was applied.

## Skill Composition

A skill's `SKILL.md` can include another skill's content at expansion time via `{{ include_prompt('other-skill') }}` in its template. Nested includes are supported (max depth 3, to prevent infinite recursion); a missing include resolves to a safe error marker rather than failing the whole expansion.

## Skill Chains

A skill version can be a **chain** (multiple steps) instead of a single template. A caller starts a run (`POST /api/skills/[name]/chain-runs`), resolves and reports on each step in turn (`POST /api/chain-runs/[runId]/advance`), and the run tracks progress server-side. SkillCanon never executes a step or observes a model's real output — the web UI's Skill Chains view is read-only run history; driving a chain is always the caller's job.

## Running Tests

```bash
pnpm exec vitest run --fileParallelism=false --testTimeout=30000
```

See `CLAUDE.md` for the full test-command reference (a faster scoped subset, the CLI's own separate test suite, etc.) — the full suite is Testcontainers-backed (spins up real ephemeral Postgres instances) and takes roughly 15–20 minutes.

## Tech Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **PostgreSQL** via **Drizzle ORM**, with Postgres Row-Level Security as a defense-in-depth tenant-isolation layer
- **Nunjucks** for skill template rendering
- **MCP SDK** for the MCP server (Streamable HTTP transport)
- **Zod** for request/tool input validation, **jose** for JWT, **bcryptjs** for password hashing
- **pnpm** for package management, **Docker Compose** for local dev and self-hosting
- **Vitest** + Testcontainers for integration testing
- **GitHub Actions** for CI (lint, typecheck, test, build, Docker build)

## Deploy

**Docker Compose** (above) is the current, working self-hosted deployment path.

A Helm chart exists at [`charts/spechub`](charts/spechub) but describes an older split backend/frontend/database deployment shape that predates the unified app and has not yet been updated to match it — don't use it to deploy the current app until it's reworked to deploy the single unified image. The same applies to `scripts/rollout.sh`. CI publishes the current unified image to `ghcr.io/mlopstapus/skillcanon` on every merge to `main`.

## Documentation

- [Architecture & Design](docs/architecture.md)
- `CLAUDE.md` — commands, conventions, and accumulated project-specific notes

## License

Apache 2.0 — see [LICENSE](LICENSE)
