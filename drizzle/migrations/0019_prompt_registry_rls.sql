-- Row-level security for the remaining Prompt Registry tenant-scoped resources
-- (022-prompt-registry-tenant-isolation), matching the session-variable pattern
-- established by 0007_identity_access_rls.sql and 0011_governance_rls.sql.
-- The application layer remains the primary tenant control; these policies are
-- the database backstop for accidental missing organization_id filters.
--
-- prompt_registry.projects and prompt_registry.project_members already have RLS
-- from 0012_prompt_registry_projects.sql. This migration covers the rest of the
-- six tables named in this feature's spec: prompts, prompt_versions,
-- subscriptions, project_teams, project_skill_assignments.

ALTER TABLE "prompt_registry"."prompts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "prompts_tenant_isolation" ON "prompt_registry"."prompts"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint

-- prompt_versions has no organization_id column of its own; tenancy is
-- resolved indirectly through its parent prompt, same shape as
-- project_members -> projects in 0012.
ALTER TABLE "prompt_registry"."prompt_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompt_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "prompt_versions_tenant_isolation" ON "prompt_registry"."prompt_versions"
  TO skillcanon_app
  USING (
    EXISTS (
      SELECT 1
      FROM prompt_registry.prompts
      WHERE prompts.id = prompt_versions.prompt_id
        AND prompts.organization_id = current_setting('app.current_org_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM prompt_registry.prompts
      WHERE prompts.id = prompt_versions.prompt_id
        AND prompts.organization_id = current_setting('app.current_org_id')::uuid
    )
  );
--> statement-breakpoint

ALTER TABLE "prompt_registry"."subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "subscriptions_tenant_isolation" ON "prompt_registry"."subscriptions"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint

-- project_teams has no organization_id column of its own; tenancy is
-- resolved indirectly through its parent project, same shape as
-- project_members -> projects in 0012.
ALTER TABLE "prompt_registry"."project_teams" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."project_teams" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "project_teams_tenant_isolation" ON "prompt_registry"."project_teams"
  TO skillcanon_app
  USING (
    EXISTS (
      SELECT 1
      FROM prompt_registry.projects
      WHERE projects.id = project_teams.project_id
        AND projects.organization_id = current_setting('app.current_org_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM prompt_registry.projects
      WHERE projects.id = project_teams.project_id
        AND projects.organization_id = current_setting('app.current_org_id')::uuid
    )
  );
--> statement-breakpoint

ALTER TABLE "prompt_registry"."project_skill_assignments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."project_skill_assignments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "project_skill_assignments_tenant_isolation" ON "prompt_registry"."project_skill_assignments"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
