# Cross-Page Polish & Accessibility Quickstart

## Automated Checks

Run from the repo root:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

Expected result: all commands pass with no critical or serious accessibility regressions covered by render assertions and static `axe-core` audits.

## Manual Smoke Path

Exercise the go-live path in a production-like dev environment:

1. Register a first account and organization.
2. Accept an invitation as a second user.
3. Create a team.
4. Create a project.
5. Create a governance policy.
6. Create a prompt.
7. Expand the prompt.
8. Create and run a skill-chain workflow.
9. View the audit log.

For each step, check:
- Keyboard tab order reaches every visible control in logical order.
- Focus indicators are visible on navigation, buttons, links, inputs, drawers, dialogs, rows, and pagination.
- Empty, loading, and error states use the documented pattern or have an accepted page-specific copy/action exception.
- Content is readable and not clipped at mobile, tablet, and desktop widths.
- Dark and light token contexts remain legible wherever the page supports both.

## In-Scope Route Inventory

- `/register`, `/login`, `/invite/[token]`, `/welcome`
- `/dashboard`
- `/teams`
- `/projects`, `/projects/[id]`
- `/prompts`, `/prompts/[name]`
- `/metrics`
- `/settings/api-keys`
- `/settings/audit-log`
- `/access-unavailable`

Billing UI is excluded while billing remains deferred.

## Manual Evidence Checklist

| Area | Evidence to record | Blocking condition |
| --- | --- | --- |
| Automated accessibility | `pnpm test` output for static axe audits | Any critical or serious violation |
| Keyboard navigation | Smoke-path tab order notes | Unreachable or pointer-only control |
| Screen-reader spot check | Landmark, heading, label, status, and row/detail notes | Confusing or missing context even when markup is technically valid |
| Responsive layout | Mobile, tablet, and desktop observations | Clipped content, overlapped UI, hidden required action, unintended horizontal scroll |
| Theme coverage | Dark mode and supported light token context observations | Unthemed surface or insufficient legibility |
| State-pattern exceptions | Route, reason, and accepted copy/action difference | Layout, role, focus, or responsive exception |
