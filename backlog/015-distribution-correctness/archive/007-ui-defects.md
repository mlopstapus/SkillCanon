---
epic: 015-distribution-correctness
feature: 007-ui-defects
status: done
dependencies: []
---

# UI Defects Found in the Smoke Test

## Requirements

- [x] Version strings have no single format: the UI's "New version" drawer stores `v1`, the REST route stores whatever it is sent (`1`, `2`). Metrics then prepends `v` and renders `vv1`. Normalise on write (and migrate existing rows), and render without a hardcoded prefix.
- [x] Audit log throws React hydration error #418 on every load (text mismatch, most likely locale/timezone formatting of timestamps on server vs browser).
- [x] The audit-log transport filter has `web`, `api`, `cli`, `system`, but no `mcp`; MCP calls are not distinguishable.
- [x] API-key scopes still say `prompts:read`, `prompts:write`, `workflows:run`; the UI says skills and chains.
- [x] Policy enforcement buttons (prepend/append/inject/validate) have no accessible name in the accessibility tree.
- [x] A failed sign-in clears the email field along with the password, so the user retypes both.
- [x] Not checked yet: keyboard-only navigation, sending an invitation and accepting it, ownership transfer, chain authoring in the UI. Now covered by `e2e/ui-walk.e2e.test.ts`: keyboard-only navigation (Tab to the nav, Enter opens the page), chain authoring (New version, Chain, step 1, publish, Steps tab), ownership transfer to a team, and sending an invitation. Defects found and fixed: the chain step builder's skill select and version input had no accessible name; sending an invitation gave no confirmation (now "Invitation sent to …"). Accepting an invitation is not e2e-checkable without SMTP (the token only goes out by email) and the UI has no pending-invitations list; both are tracked in `008-invitation-follow-ups.md`.
