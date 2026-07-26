# Quickstart: Audit Write Path Retrofit

## Focused Verification

```bash
pnpm vitest run   src/bcs/audit-compliance/application/record.test.ts   src/bcs/audit-compliance/infrastructure/audit-events-repo.test.ts   src/bcs/identity-access/application/create-organization.test.ts   src/bcs/identity-access/application/bootstrap-organization.test.ts   src/bcs/identity-access/application/create-team.test.ts   src/bcs/identity-access/application/update-team.test.ts   src/bcs/identity-access/application/reparent-team.test.ts   src/bcs/identity-access/application/insert-team-between.test.ts   src/bcs/identity-access/application/create-user.test.ts   src/bcs/identity-access/application/update-user.test.ts   src/bcs/identity-access/application/deactivate-user.test.ts   src/bcs/identity-access/application/login.test.ts   src/bcs/identity-access/application/logout.test.ts   src/bcs/identity-access/application/invite-user.test.ts   src/bcs/identity-access/application/accept-invitation.test.ts   src/bcs/identity-access/application/revoke-invitation.test.ts   src/bcs/identity-access/application/create-api-key.test.ts   src/bcs/identity-access/application/revoke-api-key.test.ts
```

## Full Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected outcomes:

- New migrations add non-null `transport` and nullable `source_ip` to `audit.audit_events`.
- Every `record()` call passes a real transport.
- Retrofitted organization, team, and user mutations emit exactly one audit row on success.
- Forced failures roll back mutation and audit event together.
- Contract documentation lists the canonical verbs and UI color mapping.
