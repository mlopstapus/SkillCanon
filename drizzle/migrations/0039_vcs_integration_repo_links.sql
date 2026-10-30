CREATE TABLE "vcs_integration"."repo_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"repo_full_name" text NOT NULL,
	"project_id" uuid NOT NULL,
	"linked_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlinked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "vcs_integration"."repo_links" ADD CONSTRAINT "repo_links_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "vcs_integration"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repo_links_live_unique" ON "vcs_integration"."repo_links" USING btree ("installation_id","github_repo_id","project_id") WHERE "vcs_integration"."repo_links"."unlinked_at" is null;--> statement-breakpoint
CREATE INDEX "repo_links_organization_id_project_id_index" ON "vcs_integration"."repo_links" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "repo_links_github_repo_id_index" ON "vcs_integration"."repo_links" USING btree ("github_repo_id");
--> statement-breakpoint
-- Grants and RLS (011-vcs-integration/002). Same two-role pattern as
-- installations: app is tenant-scoped, auth (the webhook) sees every link to
-- resolve the owning organization from a GitHub repo id. No DELETE: unlink is soft.
GRANT SELECT, INSERT, UPDATE ON "vcs_integration"."repo_links" TO skillcanon_app, skillcanon_auth;
--> statement-breakpoint
ALTER TABLE "vcs_integration"."repo_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vcs_integration"."repo_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "repo_links_tenant_isolation" ON "vcs_integration"."repo_links"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint
CREATE POLICY "repo_links_webhook" ON "vcs_integration"."repo_links"
  TO skillcanon_auth
  USING (true)
  WITH CHECK (true);
