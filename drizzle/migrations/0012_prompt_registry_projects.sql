CREATE TABLE "prompt_registry"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"lead_user_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_organization_id_name_unique" UNIQUE("organization_id","name"),
	CONSTRAINT "projects_organization_id_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "prompt_registry"."project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_unique" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "prompt_registry"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "projects_organization_id_name_index" ON "prompt_registry"."projects" USING btree ("organization_id","name");
--> statement-breakpoint
CREATE INDEX "projects_organization_id_team_id_name_index" ON "prompt_registry"."projects" USING btree ("organization_id","team_id","name");
--> statement-breakpoint
CREATE INDEX "project_members_project_id_created_at_index" ON "prompt_registry"."project_members" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX "project_members_user_id_index" ON "prompt_registry"."project_members" USING btree ("user_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "prompt_registry"."projects" TO skillcanon_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "prompt_registry"."project_members" TO skillcanon_app;
--> statement-breakpoint
ALTER TABLE prompt_registry.projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON prompt_registry.projects
  TO skillcanon_app
  USING (organization_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint
ALTER TABLE prompt_registry.project_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON prompt_registry.project_members
  TO skillcanon_app
  USING (
    EXISTS (
      SELECT 1
      FROM prompt_registry.projects
      WHERE projects.id = project_members.project_id
        AND projects.organization_id = current_setting('app.current_org_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM prompt_registry.projects
      WHERE projects.id = project_members.project_id
        AND projects.organization_id = current_setting('app.current_org_id')::uuid
    )
  );
