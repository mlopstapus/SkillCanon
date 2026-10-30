---
epic: 015-distribution-correctness
feature: 003-chains-over-cli-and-mcp
status: done
dependencies: []
---

# Chains Over CLI and MCP

A chain skill (`ship-it`, two steps) is broken outside REST.

## Requirements

- [x] CLI: the synced chain stub says "Run `skillcanon run ship-it`", and that command fails with `No skill named "ship-it" exists`. `run` must start a chain run (`POST /api/skills/[name]/chain-runs`) and print step 1, and an `advance` subcommand (or equivalent) must step it on.
- [x] MCP: `sh-workflow-run` starts a run and returns step `a` with `pendingStep: "a"`, but no MCP tool advances or abandons a run. Add `sh-chain-advance` (and rename the `workflow` tools to `chain`, keeping the old names as aliases for one release).
- [x] REST `expand` on a chain returns 404 "nonexistent, unpublished, or deprecated". Return a 409/422 that says it is a chain and names the chain-runs route.

CLI side: `skillcanon run <chain>` starts a run and prints step 1; `skillcanon advance <runId> <stepIndex>` reports and prints the next step; `skillcanon abandon <runId>` stops it (covered in `e2e/cli.e2e.test.ts`).
