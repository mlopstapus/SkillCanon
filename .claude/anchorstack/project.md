# Project Config

## Git
provider: github
base_branch: main

## Stack
Unified pnpm-managed Next.js/TypeScript application at the repo root (`src/`) — App Router, seven bounded-context folders under `src/bcs/` plus `src/shared/{db,ui,config,logging}`, per `context/repo-structure.md`. Currently an empty scaffold (no business logic yet). The previous split Python/FastAPI backend and Next.js 14 frontend are preserved at `legacy/backend/` and `legacy/frontend/` (SQLAlchemy async + asyncpg, Alembic, MCP server, uv/ruff/pytest; Radix UI + Tailwind), run manually during the transition — as of `005-docker-compose-dev-environment`, `docker compose up -d` now builds and runs the new unified scaffold (`app` service) instead. Postgres database (`database/`); schema creation is owned by Drizzle migrations (`pnpm db:migrate`), not a pre-baked init script. Docker Compose for local dev; Helm chart (`charts/skillcanon/`) for Kubernetes deploy, published to GHCR as an OCI artifact.

Note: this is the TypeScript refactor in progress (epic `001-typescript-refactor-foundation`). Re-run as-setup-project once the legacy backend/frontend are fully retired to drop the legacy-specific notes below.

## Compliance
hipaa: false
soc2: true
gdpr: false
pci: false

Note: NIST (likely NIST 800-53 / CSF alignment) also called out as in-scope alongside SOC2. Not a dedicated as-finish check yet — flag NIST-relevant controls (access control, audit logging, encryption) manually until a dedicated check exists.

## Install
pnpm install

## Dev
pnpm dev

Note: for an explicit alternate local port, use `pnpm exec next dev -p <port>`; `pnpm dev -- --port <port>` is parsed by Next 16 as a project directory.

## Build
pnpm build

## Rebuild (self-hosted stack — runs the new unified `app` + `database` services)
docker compose up -d

Note: bare `docker compose up -d` does not rebuild the `app` image — it only starts/recreates containers from whatever image already exists, so source (`src/**`) changes are invisible to the running container until you rebuild. `docker compose up -d app` (no `--build`) is enough to pick up a `docker-compose.yaml` env-var default change (confirmed 2026-08-09, fixing a stale `JWT_SECRET`), but any change to `src/`/`Dockerfile` needs `docker compose up -d --build app` — confirmed safe on this shared long-lived dev stack (only rebuilds/recreates the `app` service; the `database` service and its volume/data are untouched even though `docker compose ps` may show it "Recreated" too — verify data survived via a row count query if in doubt, don't assume loss).

## Type check
pnpm typecheck

Note: the new scaffold has strict TypeScript project-wide. Legacy backend has no type checker configured (no mypy/pyright) — it's the code this rewrite is replacing, not something to extend coverage to. `cli/` (see Test section below) is excluded from this root command — its own `pnpm --dir cli run typecheck` must be run separately.

## Lint
pnpm lint

Note: legacy lint commands (`cd legacy/backend && ruff check .` / `cd legacy/frontend && npm run lint`) still work against the preserved legacy code if needed.

## Test
unit: pnpm vitest run src/proxy.test.ts 'src/app/(app)/app-shell-access.test.ts' 'src/app/(app)/_components/nav-model.test.ts' 'src/app/(app)/_components/app-navigation.test.tsx' 'src/app/(app)/_components/account-footer.test.tsx' 'src/app/(app)/_components/app-shell.test.tsx' src/bcs/billing-entitlements/application/resolve-entitlements.test.ts src/bcs/billing-entitlements/application/has-entitlement.test.ts src/bcs/identity-access/application/authenticate-session.test.ts 'src/app/_components/marketing'
integration: pnpm exec vitest run --fileParallelism=false --testTimeout=30000
cli: pnpm --dir cli run typecheck && pnpm --dir cli test

Note: `cli/` (added by `029-skill-sync-cli`) is a separate, independent package — own `package.json`/lockfile/`node_modules`, excluded from the root `tsconfig.json`/`eslint.config.mjs` (mirroring how `legacy/` is excluded) and from the two commands above. Run its own `pnpm --dir cli test` (fast — mocked HTTP server + temp dirs, no Testcontainers/Docker) separately.

Note: legacy backend tests still run via `cd legacy/backend && uv run pytest tests/ -v` (use `uv run`, not bare `python -m pytest` — deps live in uv's managed venv). If pytest/pytest-asyncio are missing (`ModuleNotFoundError`), the venv only has base deps — run `uv sync --extra dev` first (bare `uv sync` does not install the `dev` optional-dependency group). Legacy frontend has no test script configured. The new scaffold's full Vitest suite is no longer a trivial smoke test — as of `027-rest-api-core-routes` it's 223 test files / 1064 tests, mostly Testcontainers-backed Postgres integration tests. Default (parallel) execution risks transient timeouts from Docker resource contention across dozens of simultaneous Postgres containers. Use the exact integration command above for a reliable full-suite pass (~15 minutes); `pnpm test -- --fileParallelism=false --testTimeout=30000` passes the flags incorrectly as positional args and leaves Vitest on its 5s timeout. Use `run_in_background` or a long foreground timeout either way, not the default.

Note: the marketing landing page (`014-marketing-landing-page`) has no jsdom/`@testing-library` dependency — interactive client islands (theme toggle, hero panel, integration tabs, scroll-reveal) are unit-tested via their DOM-free pure-logic modules and structurally via `renderToStaticMarkup`; actual click-driven interaction and visual/mockup parity are verified manually in a real browser (see `specs/014-marketing-landing-page/quickstart.md`), not simulated in Vitest.

## Rebuild — port conflicts
This machine runs multiple unrelated Docker Compose projects concurrently (tribe-build, multica,
supabase stack, seamless-postgres). SkillCanon's default ports (5432 database, 3000 app — plus 8000 if
running the legacy backend manually alongside) can collide with them. Confirmed resolution
preference: stop the conflicting containers from the other project rather than remap SkillCanon's
ports - ask before stopping anything, since it affects other in-progress work. In managed Multica
runs where the conflicting containers are platform services or otherwise should not be stopped, use a
temporary Compose override file with `ports: !override` to remap SkillCanon locally (for example
database `5434:5432`, app `3001:3000`) and leave docker-compose.yaml unchanged.
