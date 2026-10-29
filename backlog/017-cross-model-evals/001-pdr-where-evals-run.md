---
epic: 017-cross-model-evals
feature: 001-pdr-where-evals-run
status: open
dependencies: []
---

# PDR: Where Evals Run

## Requirements

- [ ] A PDR choosing between (a) the CLI runs evals with the caller's own provider keys and uploads results, (b) a server-side runner with bring-your-own keys stored per org, (c) a separate worker. Recommendation: (a).
- [ ] The PDR states how model ids are named (provider + model id), and that results are never compared across different content digests.
