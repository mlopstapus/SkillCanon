# PDR-014: GitHub App, Not Personal Access Token, for GitHub Integration

**Status:** Accepted
**Date:** 2026-07-25

## Context

`vcs-integration` needs to read PR/commit data and post Check Runs back to GitHub. Two real ways to authenticate against GitHub's API for this: a per-user Personal Access Token pasted in by whoever sets it up, or a GitHub App installed on an org/repo with scoped permissions and webhook delivery built in.

## Options Considered

### Personal Access Token + manually configured webhook
A user pastes a PAT (or fine-grained PAT) into SkillCanon; a webhook URL is configured by hand in the repo's GitHub settings pointing at SkillCanon.
Pros: fastest to stand up — no GitHub App registration/review, no installation flow to build.
Cons: the token carries whatever permissions its owner has, not a scoped grant — a real over-permissioning risk for a security/governance product to ship; webhook config is a manual per-repo step (contrary to the "zero ongoing thought from the user" goal PDR-011 already committed to for roster sync); the integration silently breaks if the token owner leaves the org or the token expires/is revoked, with no clean re-auth flow; doesn't scale to "install once per GitHub org, works across every repo" the way the actual feature (many-to-many project↔repo linking) needs.

### GitHub App (chosen)
Register a GitHub App with scoped permissions (`checks:write`, `pull_requests:read`, `contents:read`, `metadata:read`), installed per org/repo by an admin through GitHub's own install flow. Receives webhooks directly (`installation`, `installation_repositories`, `pull_request`) via a registered webhook URL — no manual per-repo webhook setup. Short-lived installation access tokens are minted on demand from the App's private key, never a long-lived user credential.
Pros: scoped, least-privilege permissions instead of a full user token; one install covers every repo the installer grants; webhook delivery is automatic once installed, matching the "zero ongoing thought" bar already set for the CLI/roster-sync side of this product; also the correct long-term primitive if pre-merge CI execution (running a skill as an actual merge gate) is ever built — that will need the same App's `checks:write` and a way to fetch repo contents, not a second integration built later.
Cons: more setup work up front (App registration, private key management, installation-token exchange flow, webhook signature verification); requires the GitHub App's private key to be stored as a real secret (env var, per this repo's existing credential convention — see `docker-compose.yaml`'s Postgres credentials and the SMTP/Sentry pattern in `context/third-party-services.md`), not committed anywhere.

## Decision

GitHub App. Installation tokens are minted per-request from the App's private key (GitHub's normal 1-hour-lived token exchange) and never persisted; only the App's private key and each `Installation`'s GitHub-assigned installation ID are stored.

## Consequences

- **Positive:** least-privilege access; automatic webhook delivery on install with no manual per-repo config step; sets up the exact primitive (`checks:write`, App-scoped tokens) a future pre-merge CI-gating feature would also need, so that feature is additive later rather than a second integration rebuild.
- **Negative:** more upfront build cost than a PAT (App registration, installation-token exchange, webhook signature verification via HMAC) before any value ships.
- **Risks:** the App's private key is now the single credential whose compromise affects every installed org — mitigated by the existing env-var-secret convention (never hardcoded, never committed) and by installation tokens being short-lived and minted on demand rather than cached long-term.
