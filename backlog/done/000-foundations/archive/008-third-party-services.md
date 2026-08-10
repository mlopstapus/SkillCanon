---
type: foundations
item: 008-third-party-services
status: done
deliverable: context/third-party-services.md
---

# Third-Party Service Selection

Most Build vs Buy decisions were already made in `context/architecture.md` (Stripe for payments, Sentry for error tracking, RDS for managed Postgres). The one gap is transactional email — needed for invitations (`002-identity-access`) and receipts/billing notifications (`009-billing-entitlements`) — plus confirming exact Sentry setup.

## What We Need to Decide / Research

- Transactional email provider: Resend vs. Postmark vs. SES (already in the AWS ecosystem per PDR-009, which may simplify IAM/billing) — evaluate deliverability, pricing at expected volume, and DX.
- Self-hosted email story: self-hosters need to configure their own SMTP/provider credentials rather than depend on the maintainer's account — confirm the app supports pluggable SMTP config (env vars) as a fallback so self-host doesn't hard-require a specific vendor account.
- Sentry setup: single project vs. separate projects per environment, source map upload in the CI pipeline, whether self-hosted installs get Sentry at all (likely opt-in via env var, not bundled/forced).

## Options / Considerations

- SES is worth defaulting to for the managed SaaS specifically because the infra is already on AWS (PDR-009) — one less external vendor relationship, IAM-based auth instead of another API key to manage. Self-hosted installs still need generic SMTP config as a fallback since not everyone wants an AWS account just to self-host.

## Deliverable

`context/third-party-services.md` — email provider decision (with the self-host SMTP fallback story) and Sentry project/environment setup.

## Dependencies

None, but blocks the invitation feature in `002-identity-access` and the billing notification features in `009-billing-entitlements`.
