CREATE TABLE "distribution"."feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"serve_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"rating" text,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "distribution"."feedback" ADD CONSTRAINT "feedback_serve_id_prompt_usage_id_fk" FOREIGN KEY ("serve_id") REFERENCES "distribution"."prompt_usage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_organization_id_created_at_index" ON "distribution"."feedback" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "feedback_serve_id_index" ON "distribution"."feedback" USING btree ("serve_id");--> statement-breakpoint
ALTER TABLE "distribution"."feedback" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "distribution"."feedback" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "feedback_tenant_isolation" ON "distribution"."feedback"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
