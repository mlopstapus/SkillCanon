CREATE TABLE "distribution"."prompt_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "prompt_usage_project_id_created_at_index" ON "distribution"."prompt_usage" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_usage_project_id_prompt_id_index" ON "distribution"."prompt_usage" USING btree ("project_id","prompt_id");--> statement-breakpoint
CREATE INDEX "prompt_usage_project_id_user_id_index" ON "distribution"."prompt_usage" USING btree ("project_id","user_id");
