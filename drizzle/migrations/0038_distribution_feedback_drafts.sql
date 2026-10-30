CREATE TABLE "distribution"."feedback_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"base_version_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"proposed_content" text NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"source_feedback_ids" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"accepted_version_id" uuid
);
--> statement-breakpoint
CREATE TABLE "distribution"."third_party_opt_in" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_drafts_organization_id_prompt_id_index" ON "distribution"."feedback_drafts" USING btree ("organization_id","prompt_id");
--> statement-breakpoint
ALTER TABLE "distribution"."feedback_drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "distribution"."feedback_drafts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "feedback_drafts_tenant_isolation" ON "distribution"."feedback_drafts"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint
ALTER TABLE "distribution"."third_party_opt_in" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "distribution"."third_party_opt_in" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "third_party_opt_in_tenant_isolation" ON "distribution"."third_party_opt_in"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
