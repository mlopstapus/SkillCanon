CREATE TABLE "prompt_registry"."project_skill_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"requirement" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_skill_assignments_project_id_skill_id_unique" UNIQUE("project_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "prompt_registry"."project_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_teams_project_id_team_id_unique" UNIQUE("project_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."project_skill_assignments" ADD CONSTRAINT "project_skill_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "prompt_registry"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_registry"."project_skill_assignments" ADD CONSTRAINT "project_skill_assignments_skill_id_prompts_id_fk" FOREIGN KEY ("skill_id") REFERENCES "prompt_registry"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_registry"."project_teams" ADD CONSTRAINT "project_teams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "prompt_registry"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_skill_assignments_project_id_requirement_index" ON "prompt_registry"."project_skill_assignments" USING btree ("project_id","requirement");--> statement-breakpoint
CREATE INDEX "project_skill_assignments_skill_id_index" ON "prompt_registry"."project_skill_assignments" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "project_teams_project_id_index" ON "prompt_registry"."project_teams" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_teams_team_id_index" ON "prompt_registry"."project_teams" USING btree ("team_id");