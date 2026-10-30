CREATE TABLE "prompt_registry"."eval_provider_configs" (
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"api_key_enc" text NOT NULL,
	"models" jsonb NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_provider_configs_organization_id_provider_pk" PRIMARY KEY("organization_id","provider")
);
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_settings" ADD COLUMN "default_judge" text;--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_provider_configs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "prompt_registry"."eval_provider_configs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "eval_provider_configs_tenant_isolation" ON "prompt_registry"."eval_provider_configs"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
