-- Row-level security for Distribution's only tenant-scoped table
-- (030-distribution-tenant-isolation), matching the session-variable pattern
-- established by 0007_identity_access_rls.sql, 0011_governance_rls.sql, and
-- 0019_prompt_registry_rls.sql. The application layer remains the primary
-- tenant control; this policy is the database backstop for accidental
-- missing organization_id filters.
--
-- distribution.prompt_usage was created without RLS by
-- 0022_distribution_prompt_usage.sql and extended by
-- 0025_distribution_usage_telemetry.sql; it carries a direct organization_id
-- column, so no join is needed to resolve its tenant scope.

ALTER TABLE "distribution"."prompt_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "distribution"."prompt_usage" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "prompt_usage_tenant_isolation" ON "distribution"."prompt_usage"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
