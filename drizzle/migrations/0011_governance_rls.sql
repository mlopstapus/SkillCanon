-- Row-level security for Governance resources (001-governance-tenant-isolation-tests),
-- matching the session-variable pattern established by 0007_identity_access_rls.sql.
-- The application layer remains the primary tenant control; these policies are
-- the database backstop for accidental missing organization_id filters.
ALTER TABLE "governance"."policies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "governance"."policies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "policies_tenant_isolation" ON "governance"."policies"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint

ALTER TABLE "governance"."objectives" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "governance"."objectives" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "objectives_tenant_isolation" ON "governance"."objectives"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
