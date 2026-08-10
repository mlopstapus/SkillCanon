---
type: foundations
item: 005-deployment-environments-and-aws-topology
status: done
deliverable: context/deployment.md
---

# Deployment, Environments & AWS Topology

PDR-009 chose AWS (ECS/Fargate, RDS, ALB) for the managed SaaS but left account/network topology, environment strategy, and availability targets as open questions. This item closes them out with an actual, written topology and pipeline — needed before epic 001's CI pipeline feature and before the SaaS deployment work in later epics.

## What We Need to Decide / Research

- AWS account structure: single account with environment-tagged resources, vs. separate accounts per environment (dev/staging/prod) — the latter is more isolated but more setup overhead for a solo maintainer.
- VPC layout: public/private subnet split, how RDS and ECS tasks are network-isolated, NAT gateway cost tradeoffs.
- RDS configuration: single-AZ (cheaper, launch-appropriate) vs. Multi-AZ (higher availability, higher cost) — tie to an actual availability target, not a default.
- CI/CD pipeline: GitHub Actions (already used per the current `.github/workflows/`) building the Docker image, running the epic-000-003 test suite, then deploying to ECS — confirm this carries forward.
- Infrastructure as code: Terraform vs. AWS CDK (PDR-009 mandates one of these, doesn't pick) — pick one and justify given solo-maintainer TypeScript-everywhere preference (CDK is TypeScript-native, which may matter here).
- Release process: how a deploy to staging vs. production is triggered, rollback approach.
- Self-hosted deployment story: confirm Docker Compose and the Helm chart continue to be the two self-host paths, and how the same container image serves both self-host and the AWS-hosted SaaS (per the single-repo, plan-gated decision in PDR-006).

## Options / Considerations

- CDK (TypeScript) over Terraform (HCL) is worth defaulting to given the project's explicit "one language" goal (PDR-001) — infra-as-code in the same language as the app is a genuine coherence win for a solo maintainer, though Terraform's ecosystem/maturity is the counterargument.
- Single AWS account with tagged environments is likely the pragmatic starting point for a solo maintainer pre-revenue; separate accounts can be revisited once there's an actual compliance/audit reason (e.g. an Enterprise customer's security review) to demand it.

## Deliverable

`context/deployment.md` — account/VPC topology, RDS configuration and stated availability target, IaC tool choice, CI/CD pipeline description, release/rollback process, and confirmation of the self-hosted Compose/Helm story alongside it.

## Dependencies

None, but blocks the AWS-facing portions of `008-distribution` and `009-billing-entitlements` (Stripe webhook endpoint needs a real deployed URL to register against).
