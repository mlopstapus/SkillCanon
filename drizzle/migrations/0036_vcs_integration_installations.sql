CREATE SCHEMA "vcs_integration";
--> statement-breakpoint
CREATE TABLE "vcs_integration"."installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"github_account_login" text NOT NULL,
	"github_account_type" text NOT NULL,
	"suspended_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vcs_integration"."webhook_deliveries" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "installations_github_installation_id_unique" ON "vcs_integration"."installations" USING btree ("github_installation_id");--> statement-breakpoint
CREATE INDEX "installations_organization_id_index" ON "vcs_integration"."installations" USING btree ("organization_id");
--> statement-breakpoint
-- Grants and RLS (011-vcs-integration/001). skillcanon_app serves the web UI
-- under a tenant context; skillcanon_auth serves the GitHub webhook, which has
-- no session and must find an installation by GitHub's id before any
-- organization is known (same coexisting-roles pattern as identity_access).
-- Neither role can DELETE: an uninstall is a soft delete.
GRANT USAGE ON SCHEMA vcs_integration TO skillcanon_app, skillcanon_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "vcs_integration"."installations" TO skillcanon_app, skillcanon_auth;
--> statement-breakpoint
GRANT SELECT, INSERT ON "vcs_integration"."webhook_deliveries" TO skillcanon_auth;
--> statement-breakpoint
ALTER TABLE "vcs_integration"."installations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vcs_integration"."installations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "installations_tenant_isolation" ON "vcs_integration"."installations"
  TO skillcanon_app
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
--> statement-breakpoint
CREATE POLICY "installations_webhook" ON "vcs_integration"."installations"
  TO skillcanon_auth
  USING (true)
  WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "vcs_integration"."webhook_deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vcs_integration"."webhook_deliveries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "webhook_deliveries_webhook" ON "vcs_integration"."webhook_deliveries"
  TO skillcanon_auth
  USING (true)
  WITH CHECK (true);
