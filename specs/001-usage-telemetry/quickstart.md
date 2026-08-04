# Quickstart: Usage Telemetry

## Automated Verification

1. Run the Distribution telemetry tests:

   ```bash
   corepack pnpm vitest run 'src/bcs/distribution' 'src/app/api/skills/[name]/expand' 'src/app/api/chain-runs/[runId]/advance' src/app/api/metrics
   ```

2. Run app metrics rendering tests:

   ```bash
   corepack pnpm vitest run 'src/app/(app)/metrics'
   ```

3. Run full project checks:

   ```bash
   corepack pnpm typecheck
   corepack pnpm lint
   corepack pnpm test
   ```

## Manual Smoke Test

1. Sign in to an organization with at least one published template skill.
2. Call `POST /api/skills/{name}/expand` with valid input.
3. Open `/metrics`.
4. Confirm total invocations increments, the skill/version row appears, success count increments, and latency is shown.
5. Seed or trigger usage for another organization and confirm it is absent from the first organization's `/api/metrics` response.

## Skill Sync CLI Smoke Test

1. Run the CLI from a git checkout so it passes `gitRemoteUrl`, `gitBranch`, and `gitCommitSha` to the REST expand endpoint.
2. Confirm the same REST expansion row is created with git context populated.

## Deferred MCP Smoke Test

MCP `sh-run` parity is intentionally deferred. When MCP usage telemetry is implemented, repeat the REST smoke test with MCP and compare row semantics.
