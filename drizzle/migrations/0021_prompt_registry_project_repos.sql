CREATE TABLE "prompt_registry"."project_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"branch" text DEFAULT 'main' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_repos_project_id_url_unique" UNIQUE("project_id","url")
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."project_repos" ADD CONSTRAINT "project_repos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "prompt_registry"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_repos_project_id_index" ON "prompt_registry"."project_repos" USING btree ("project_id");
--> statement-breakpoint

-- Row-level security, added in the same migration that creates this table
-- (023-prompt-registry-views-ui) rather than deferred to a later tenant-
-- isolation feature — project_repos has no organization_id column of its
-- own; tenancy is resolved via the same join-through-parent-project shape
-- already established by project_teams (0019_prompt_registry_rls.sql).
ALTER TABLE "prompt_registry"."project_repos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."project_repos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "project_repos_tenant_isolation" ON "prompt_registry"."project_repos"
  TO skillcanon_app
  USING (
    EXISTS (
      SELECT 1
      FROM prompt_registry.projects
      WHERE projects.id = project_repos.project_id
        AND projects.organization_id = current_setting('app.current_org_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM prompt_registry.projects
      WHERE projects.id = project_repos.project_id
        AND projects.organization_id = current_setting('app.current_org_id')::uuid
    )
  );