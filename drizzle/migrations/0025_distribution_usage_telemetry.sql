ALTER TABLE "distribution"."prompt_usage" ADD COLUMN "prompt_version" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "distribution"."prompt_usage" ADD COLUMN "status_code" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "distribution"."prompt_usage" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "distribution"."prompt_usage" ADD COLUMN "git_remote_url" text;--> statement-breakpoint
ALTER TABLE "distribution"."prompt_usage" ADD COLUMN "git_branch" text;--> statement-breakpoint
ALTER TABLE "distribution"."prompt_usage" ADD COLUMN "git_commit_sha" text;--> statement-breakpoint
CREATE INDEX "prompt_usage_organization_id_created_at_index" ON "distribution"."prompt_usage" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_usage_organization_id_status_code_index" ON "distribution"."prompt_usage" USING btree ("organization_id","status_code");--> statement-breakpoint
CREATE INDEX "prompt_usage_organization_id_prompt_id_index" ON "distribution"."prompt_usage" USING btree ("organization_id","prompt_id");--> statement-breakpoint
CREATE INDEX "prompt_usage_git_commit_sha_index" ON "distribution"."prompt_usage" USING btree ("git_commit_sha");
