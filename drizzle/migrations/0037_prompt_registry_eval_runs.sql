CREATE TABLE "prompt_registry"."eval_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"model" text NOT NULL,
	"case_id" text NOT NULL,
	"passed" boolean NOT NULL,
	"score_pct" integer,
	"latency_ms" integer,
	"tokens" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_registry"."eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"content_digest" text NOT NULL,
	"models" jsonb NOT NULL,
	"judge" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prompt_registry"."eval_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_results" ADD CONSTRAINT "eval_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "prompt_registry"."eval_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_results_run_id_index" ON "prompt_registry"."eval_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "eval_runs_organization_id_prompt_version_id_index" ON "prompt_registry"."eval_runs" USING btree ("organization_id","prompt_version_id");
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "eval_runs_tenant_isolation" ON "prompt_registry"."eval_runs"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_results" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_results" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "eval_results_tenant_isolation" ON "prompt_registry"."eval_results"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "eval_settings_tenant_isolation" ON "prompt_registry"."eval_settings"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
