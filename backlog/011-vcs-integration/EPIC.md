# Epic 011: VCS Integration

**Priority:** 9
**Status:** not-started
**Goal:** Tie skill usage to real GitHub activity — which governed skills ran on a branch, surfaced visibly on the PR before merge — the governance capability the product's actual differentiation depends on.

## Overview

Everything before this epic (identity, governance resolution, prompt registry, distribution) makes SkillCanon a governed prompt registry. This epic is what turns that into a governance *product*: for a linked GitHub repo, show which required skills ran on a PR's commits and which didn't. It's visibility only for this epic — no merge-blocking yet, per the explicit MVP scoping decided during architecture (`docs/architecture.md`'s Open Questions, [PDR-012](../../docs/pdr/012-vcs-integration-new-bounded-context.md) through [PDR-015](../../docs/pdr/015-prompt-usage-retention-floor.md)). A future pre-merge CI-gating epic builds on the same GitHub App installation rather than a second integration.

**Why priority 9, ahead of Billing and UI Polish (2026-07-25):** originally slotted last (as epic 011) in initial backlog planning. Re-prioritized ahead of Billing & Entitlements because it's the core governance value proposition the product exists for, while Billing has no dependency relationship with it and the self-hosted Free tier doesn't need billing to be useful. Billing & Entitlements and UI Polish & Accessibility are renumbered to priority 10 and 11 respectively (folder names unchanged — see the note in each of those epics' own `EPIC.md`).

**Hard dependencies:** Identity & Access (002, org/team/project identifiers), Prompt Registry (006, `Project`/`getProject` and the `skillcanon` CLI's existing invocation path), Governance (005, `Policy`/resolution engine to extend), and Distribution (008, the REST expand route the CLI already calls, and the route-file ownership convention this epic's webhook route follows). All four must be done before this epic's features can be built for real, not just designed against their contracts.

## Features

- [ ] [001 - GitHub App Registration & Installation](001-github-app-registration-and-installation.md)
- [ ] [002 - Repo-Project Linking](002-repo-project-linking.md)
- [ ] [003 - Required-Skill Governance Policy](003-required-skill-governance-policy.md)
- [ ] [004 - CLI Git-Context Tagging & Usage Query API](004-cli-git-context-tagging-and-usage-query-api.md)
- [ ] [005 - PR Evaluation & GitHub Check Runs](005-pr-evaluation-and-github-check-runs.md)
- [ ] [006 - VCS Integration Dashboard UI](006-vcs-integration-dashboard-ui.md)
- [ ] [007 - VCS Integration Tenant Isolation Tests](007-vcs-integration-tenant-isolation-tests.md)

*Completed features are moved to `archive/` and checked off here.*

## Dependencies

- `backlog/002-identity-access/` — done
- `backlog/005-governance/` — must be done (resolution engine this epic extends)
- `backlog/006-prompt-registry/` — must be done (`Project` model this epic's `getProject` addition lives on)
- `backlog/008-distribution/` — must be done (CLI, REST expand route, route-ownership convention)
- `docs/architecture.md`, [PDR-012](../../docs/pdr/012-vcs-integration-new-bounded-context.md)–[PDR-015](../../docs/pdr/015-prompt-usage-retention-floor.md), `src/bcs/vcs-integration/{CONTRACT,OWNERSHIP}.md`

## Notes

- MVP is **visibility only** — a dashboard view and a GitHub Check Run (`neutral`/informational, never a required/blocking check) reporting which required skills ran. No branch-protection-blocking behavior is built here.
- Monorepo path-scoping (evaluating per-project-subdirectory rather than per-repo) is an explicit known simplification, not solved in this epic — see `docs/architecture.md`'s Open Questions.
- Pre-merge CI-gating (running a skill as an actual merge gate) is out of scope entirely — a future epic, enabled by this one's GitHub App/`checks:write` foundation (PDR-014) but not built here.
