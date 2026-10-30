CREATE TABLE "vcs_integration"."pr_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"repo_link_id" uuid NOT NULL,
	"pr_number" integer NOT NULL,
	"head_sha" text NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"results" jsonb NOT NULL,
	"status" text NOT NULL,
	"github_check_run_id" bigint,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "vcs_integration"."pr_checks" ADD CONSTRAINT "pr_checks_repo_link_id_repo_links_id_fk" FOREIGN KEY ("repo_link_id") REFERENCES "vcs_integration"."repo_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pr_checks_link_pr_head_unique" ON "vcs_integration"."pr_checks" USING btree ("repo_link_id","pr_number","head_sha");--> statement-breakpoint
CREATE INDEX "pr_checks_organization_id_evaluated_at_index" ON "vcs_integration"."pr_checks" USING btree ("organization_id","evaluated_at");
--> statement-breakpoint
-- Grants and RLS (011-vcs-integration/005): app under a tenant context for the
-- dashboard; skillcanon_auth for completeness of the webhook role's reach.
-- No DELETE: PR check history is never removed.
GRANT SELECT, INSERT, UPDATE ON "vcs_integration"."pr_checks" TO skillcanon_app, skillcanon_auth;
--> statement-breakpoint
ALTER TABLE "vcs_integration"."pr_checks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vcs_integration"."pr_checks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "pr_checks_tenant_isolation" ON "vcs_integration"."pr_checks"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint
CREATE POLICY "pr_checks_webhook" ON "vcs_integration"."pr_checks"
  TO skillcanon_auth
  USING (true)
  WITH CHECK (true);
