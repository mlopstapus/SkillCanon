---
epic: 015-distribution-correctness
feature: 003-chains-over-cli-and-mcp
status: open
dependencies: []
---

# Chains Over CLI and MCP

A chain skill (`ship-it`, two steps) is broken outside REST.

## Requirements

- [ ] CLI: the synced chain stub says "Run `skillcanon run ship-it`", and that command fails with `No skill named "ship-it" exists`. `run` must start a chain run (`POST /api/skills/[name]/chain-runs`) and print step 1, and an `advance` subcommand (or equivalent) must step it on.
- [ ] MCP: `sh-workflow-run` starts a run and returns step `a` with `pendingStep: "a"`, but no MCP tool advances or abandons a run. Add `sh-chain-advance` (and rename the `workflow` tools to `chain`, keeping the old names as aliases for one release).
- [ ] REST `expand` on a chain returns 404 "nonexistent, unpublished, or deprecated". Return a 409/422 that says it is a chain and names the chain-runs route.
