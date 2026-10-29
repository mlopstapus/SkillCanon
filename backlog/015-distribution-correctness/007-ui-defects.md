---
epic: 015-distribution-correctness
feature: 007-ui-defects
status: open
dependencies: []
---

# UI Defects Found in the Smoke Test

## Requirements

- [ ] Version strings have no single format: the UI's "New version" drawer stores `v1`, the REST route stores whatever it is sent (`1`, `2`). Metrics then prepends `v` and renders `vv1`. Normalise on write (and migrate existing rows), and render without a hardcoded prefix.
- [ ] Audit log throws React hydration error #418 on every load (text mismatch, most likely locale/timezone formatting of timestamps on server vs browser).
- [ ] The audit-log transport filter has `web`, `api`, `cli`, `system`, but no `mcp`; MCP calls are not distinguishable.
- [x] API-key scopes still say `prompts:read`, `prompts:write`, `workflows:run`; the UI says skills and chains.
- [ ] Policy enforcement buttons (prepend/append/inject/validate) have no accessible name in the accessibility tree.
- [ ] A failed sign-in clears the email field along with the password, so the user retypes both.
- [ ] Not checked yet: keyboard-only navigation, sending an invitation and accepting it, ownership transfer, chain authoring in the UI.
