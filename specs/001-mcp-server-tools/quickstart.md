# Quickstart: MCP Server & Tools

## Local Setup

1. Install dependencies with the repo package manager:

```sh
corepack pnpm install
```

2. Run focused tests:

```sh
corepack pnpm vitest run src/bcs/distribution/application/mcp-session.test.ts src/bcs/distribution/application/mcp-tools.test.ts src/bcs/distribution/application/mcp-tool-characterization.test.ts src/app/mcp/route.test.ts
```

3. Run quality gates:

```sh
corepack pnpm test
corepack pnpm lint
corepack pnpm typecheck
```

## Manual MCP Smoke

1. Start the app with valid `DATABASE_URL` and `AUTH_DATABASE_URL` values:

```sh
corepack pnpm dev
```

2. Configure an MCP Streamable HTTP client:

```json
{
  "mcpServers": {
    "skillcanon": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer sh_test_..."
      }
    }
  }
}
```

3. Verify tool discovery returns exactly:

```text
sh-list
sh-search
sh-context
sh-run
sh-workflow-list
sh-workflow-run
```

4. Invoke smoke calls:

```text
sh-list
sh-search query="commit"
sh-context
sh-run name="commit" input="{\"input\":\"test\"}"
sh-workflow-list
```

Expected results:

- The first applicable tool response includes the session context block.
- Later calls in the same session omit the auto-injected block.
- `sh-run` creates one audit event and one prompt usage row.
- Invalid bearer keys are rejected before any tenant-scoped data is read.
- Logs contain user/org/tool metadata only, never the raw bearer key or any substring of it.
