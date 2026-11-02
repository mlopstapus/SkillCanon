CREATE TABLE "prompt_registry"."eval_gates" (
	"prompt_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"models" jsonb NOT NULL,
	"min_pass_pct" integer DEFAULT 100 NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_gates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_gates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "eval_gates_tenant_isolation" ON "prompt_registry"."eval_gates"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
