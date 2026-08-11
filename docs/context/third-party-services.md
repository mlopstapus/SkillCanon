# Third-Party Service Selection

**Status:** Decided
**Decided:** 2026-07-21
**Backlog item:** `backlog/000-foundations/008-third-party-services.md`

## Transactional email

**Amazon SES for the managed SaaS**, with **generic SMTP config (env vars) as the self-hosted fallback** — not a hard dependency on any single vendor.

- SaaS: infra is already on AWS (PDR-009), so SES means one fewer external vendor relationship and IAM-based auth instead of another API key to provision/rotate. Deliverability at expected early-stage volume is adequate for SES; revisit (Resend/Postmark) only if deliverability becomes a measured problem.
- Self-host: operators configure `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` (or leave unset, in which case invitation/notification emails are skipped with a clear log line, not a crash) — self-hosters should never be required to have an AWS account just to run SkillCanon.
- Both paths go through one `shared` email-sending interface (a thin abstraction: `sendEmail(to, template, data)`) so the SES vs. SMTP choice is a config-time implementation swap, not two different code paths through the app.

## Sentry setup

- **Separate Sentry projects per environment** (`skillcanon-staging`, `skillcanon-production`) rather than one project with environment tags — keeps noisy staging errors from diluting production alerting, and keeps alert routing rules simple (no environment filter needed on every alert rule).
- **Source maps uploaded in the CI pipeline** at build time (the same GitHub Actions build step that produces the Docker image — see `context/deployment.md`), using a Sentry auth token stored as a repo/environment secret.
- **Self-hosted installs: opt-in only**, via a `SENTRY_DSN` env var operators set themselves — never bundled or forced. If unset, error tracking is a no-op (errors still go to structured logs per `context/api-conventions.md`'s logging schema, just not to Sentry). This matches the same "self-host isn't forced into a vendor relationship" principle as the email decision above.

## Deliverable status

Email provider (with self-host SMTP fallback) and Sentry project/environment setup are settled. This unblocks the invitation feature in `002-identity-access` and the billing notification features in `009-billing-entitlements`.

## Implementation status (updated 2026-07-23, `009-invitations`)

- **SMTP self-host path: implemented.** `src/shared/email` (`sendEmail`) sends via `nodemailer` when `SMTP_HOST` is configured; when unset, delivery is skipped with a structured log line (via `src/shared/logging`) containing the full message — this *is* the "skipped with a clear log line, not a crash" behavior decided above, not a stub.
- **SES managed-SaaS path: not yet implemented.** No SaaS/AWS-credentialed deployment surface exists in this codebase yet to build or verify an SES integration against (no `AWS_REGION`/SES config anywhere, per `009-invitations`'s plan.md Complexity Tracking). Tracked here rather than on a specific backlog item, since this document's originating foundations item (`backlog/000-foundations/008-third-party-services.md`) is already archived/done. Whichever future item stands up the managed-SaaS deployment (see `context/deployment.md`) should implement the SES half of `sendEmail` at that point — the interface (`sendEmail({ to, subject, text })`) already accommodates a second real implementation without callers changing.
- The `sendEmail(to, template, data)` shape originally sketched above was simplified to `sendEmail({ to, subject, text })` during implementation — no templating engine exists yet in this codebase, so callers (e.g. `inviteUser`) compose the subject/body text directly rather than passing a template name.

## GitHub API (added 013-skill-import-and-external-registries, 036-external-skill-import)

`src/bcs/prompt-registry/infrastructure/github-skill-source.ts` calls `api.github.com`'s public Contents API to fetch skill content from a caller-supplied public repository at import time (`npx skills add`, or the app's New Skill drawer's "Import from link" mode). Outbound-only, no customer/organization data is sent — only the source repo owner/name/path the importing user provided. No SkillCanon data (org name, user identity, other skills) is transmitted. Unauthenticated by default (subject to GitHub's 60 req/hour per-IP rate limit); operators may set `GITHUB_TOKEN` to raise that limit — no scopes are required since only public repository content is read. Because this is outbound-only with no customer PII leaving the system, it doesn't rise to the level of a subprocessor requiring a DPA, but is documented here per this doc's own convention of tracking every external service the app talks to.
