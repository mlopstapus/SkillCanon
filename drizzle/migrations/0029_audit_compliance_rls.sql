-- Row-level security for audit.audit_events (003-audit-compliance/004), the
-- one confirmed exception to this repo's otherwise-universal M2 RLS-backstop
-- convention. Matches the coexisting-roles pattern established by
-- 0011_tenant_isolation_rls.sql for identity_access: skillcanon_app gets a
-- restrictive, organization-scoped policy; skillcanon_auth keeps its
-- existing permissive access (0007_identity_access_rls.sql's plain GRANT)
-- via its own permissive policy, since login()/acceptInvitation() write an
-- audit event before any tenant context exists.
--
-- Null-organization_id rows (a pre-auth event with no resolvable org, e.g. a
-- failed login against an unknown email) are invisible under the
-- skillcanon_app policy below — direct equality against a null column never
-- matches. This is not a new restriction: every existing org-scoped
-- application query already filters `organization_id = $1`, which already
-- silently excluded null rows before RLS existed. No consumer anywhere in
-- this codebase reads audit_events by null organization_id today (confirmed
-- by grep across audit-compliance's application layer), so this policy
-- codifies the existing behavior rather than changing it.

ALTER TABLE "audit"."audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit"."audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_events_tenant_isolation" ON "audit"."audit_events"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY "audit_events_auth_bootstrap" ON "audit"."audit_events"
  TO skillcanon_auth
  USING (true)
  WITH CHECK (true);
