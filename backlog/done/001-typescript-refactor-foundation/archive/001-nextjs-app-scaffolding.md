---
epic: 001-typescript-refactor-foundation
feature: 001-nextjs-app-scaffolding
status: done
dependencies: ["backlog/000-foundations/001-repo-structure-and-module-boundaries.md"]
---

# Next.js App Scaffolding

Stand up the single unified Next.js/TypeScript application that will eventually replace both the Python backend and the current frontend, following the folder structure decided in the repo-structure foundations item. This is the literal starting point of the refactor — an empty `src/bcs/` tree with the seven bounded-context folders present but unimplemented, a working Next.js app that boots, and the pnpm project configured.

## Requirements

- [ ] pnpm-managed Next.js (App Router) project initialized at the repo root (or a new `app/` directory — per the repo-structure decision), replacing the current split `backend/`/`frontend/` layout
- [ ] `src/bcs/{identity-access,governance,prompt-registry,workflow-orchestration,billing-entitlements,audit-compliance,distribution}/` folders created, each with an `index.ts` barrel file (empty export, to be filled in by later epics)
- [ ] `/shared/{db,ui,config}/` folders created per Distribution's OWNERSHIP.md
- [ ] TypeScript strict mode enabled project-wide
- [ ] ESLint + Prettier configured, matching or improving on the current frontend's `.eslintrc.json`
- [ ] `package.json` scripts for dev, build, lint, typecheck, test match the command names CLAUDE.md and `.claude/anchorstack/project.md` will need to reference after this epic (so `as-setup-project` can be re-run cleanly per the existing note in project.md)

## Acceptance Criteria

- [ ] `pnpm install && pnpm dev` boots the app locally with no errors
- [ ] `pnpm typecheck` (or equivalent) passes on the empty scaffold
- [ ] `pnpm lint` passes on the empty scaffold
- [ ] Folder structure matches `context/repo-structure.md` exactly (reviewed against the doc, not just "looks reasonable")

## Open Questions

- Does the new app live at the repo root, or in a new top-level directory (e.g. `app/`) alongside the old `backend/`/`frontend/` during a transition period? Affects how/when the old Python code gets removed.

## Dependencies

- `backlog/000-foundations/001-repo-structure-and-module-boundaries.md`

## Technical Notes

Per PDR-001, this is a from-scratch scaffold, not a migration of the existing frontend's `next.config.mjs`/`tsconfig.json` — start clean and pull forward only what's still correct (e.g. Tailwind/shadcn config) once the UI epics need it.
