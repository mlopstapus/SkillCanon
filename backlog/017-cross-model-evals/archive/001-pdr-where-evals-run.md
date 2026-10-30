---
epic: 017-cross-model-evals
feature: 001-pdr-where-evals-run
status: done
dependencies: []
---

# PDR: Where Evals Run

## Requirements

- [x] A PDR choosing between (a) the CLI runs evals with the caller's own provider keys and uploads results, (b) a server-side runner with bring-your-own keys stored per org, (c) a separate worker. Recommendation: (a). **Deviation (D4):** [PDR-020](../../../docs/pdr/020-where-evals-run.md) chooses central runners against an operator-configured provider pool; the CLI only submits and fetches.
- [x] The PDR states how model ids are named (provider + model id), and that results are never compared across different content digests.
