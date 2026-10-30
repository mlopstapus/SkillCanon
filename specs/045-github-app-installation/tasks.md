# Tasks: GitHub App Registration & Installation

- [x] T001 Schema + migration `0036_vcs_integration_installations` (tables, grants, RLS for both roles)
- [x] T002 Env config + GitHub client (app JWT, installation lookup, token mint, signature check)
- [x] T003 Install state sign/verify, domain errors
- [x] T004 `buildInstallUrl`, `completeInstall`, `listInstallations`, `getInstallationAccessToken`
- [x] T005 `handleGithubWebhook` (verify, dedupe, installation events, pull_request stub)
- [x] T006 Thin webhook route and install callback route
- [x] T007 Settings page (not configured / empty / list, admin install button)
- [x] T008 Tests (client, install, webhook, RLS, route)
- [x] T009 README GitHub integration steps, `.env.example`, compose passthrough, CONTRACT.md
- [ ] T010 Live-App criteria (needs Ben)
