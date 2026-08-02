CREATE TABLE "prompt_registry"."skill_chain_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"prompt_name" text NOT NULL,
	"prompt_version" text NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"system_message" text,
	"user_message" text NOT NULL,
	"applied_policies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reported_status" text,
	"reported_output" text,
	"reported_error" text,
	CONSTRAINT "skill_chain_run_steps_run_id_step_index_unique" UNIQUE("run_id","step_index")
);
--> statement-breakpoint
CREATE TABLE "prompt_registry"."skill_chain_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompt_versions" ADD COLUMN "kind" text DEFAULT 'template' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompt_versions" ADD COLUMN "steps" jsonb;--> statement-breakpoint
ALTER TABLE "prompt_registry"."skill_chain_run_steps" ADD CONSTRAINT "skill_chain_run_steps_run_id_skill_chain_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "prompt_registry"."skill_chain_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_registry"."skill_chain_runs" ADD CONSTRAINT "skill_chain_runs_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "prompt_registry"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_registry"."skill_chain_runs" ADD CONSTRAINT "skill_chain_runs_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "prompt_registry"."prompt_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_chain_runs_organization_id_prompt_id_started_at_index" ON "prompt_registry"."skill_chain_runs" USING btree ("organization_id","prompt_id","started_at");--> statement-breakpoint
CREATE INDEX "skill_chain_runs_organization_id_status_index" ON "prompt_registry"."skill_chain_runs" USING btree ("organization_id","status");--> statement-breakpoint

-- Row-level security for the two new tables (026-skill-chains, PDR-017),
-- matching the session-variable pattern established by
-- 0007_identity_access_rls.sql / 0011_governance_rls.sql / 0019_prompt_registry_rls.sql.
-- Both tables carry RLS from their very first migration — no follow-up
-- tenant-isolation feature needed, since these are brand-new tables, not a
-- retrofit.

ALTER TABLE "prompt_registry"."skill_chain_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."skill_chain_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "skill_chain_runs_tenant_isolation" ON "prompt_registry"."skill_chain_runs"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint

-- skill_chain_run_steps has no organization_id column of its own; tenancy
-- is resolved indirectly through its parent run, same shape as
-- prompt_versions -> prompts in 0019.
ALTER TABLE "prompt_registry"."skill_chain_run_steps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."skill_chain_run_steps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "skill_chain_run_steps_tenant_isolation" ON "prompt_registry"."skill_chain_run_steps"
  TO skillcanon_app
  USING (
    EXISTS (
      SELECT 1
      FROM prompt_registry.skill_chain_runs
      WHERE skill_chain_runs.id = skill_chain_run_steps.run_id
        AND skill_chain_runs.organization_id = current_setting('app.current_org_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM prompt_registry.skill_chain_runs
      WHERE skill_chain_runs.id = skill_chain_run_steps.run_id
        AND skill_chain_runs.organization_id = current_setting('app.current_org_id')::uuid
    )
  );