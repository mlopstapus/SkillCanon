CREATE TABLE "workflow"."workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "workflows_organization_id_user_id_index" ON "workflow"."workflows" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "workflows_organization_id_project_id_index" ON "workflow"."workflows" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "workflows_organization_id_updated_at_index" ON "workflow"."workflows" USING btree ("organization_id","updated_at");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "workflow"."workflows" TO skillcanon_app;