CREATE TABLE "governance"."policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid,
	"project_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"enforcement_type" text NOT NULL,
	"content" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_exactly_one_scope" CHECK (("team_id" IS NULL) <> ("project_id" IS NULL)),
	CONSTRAINT "policies_enforcement_type_check" CHECK ("enforcement_type" IN ('prepend', 'append', 'inject', 'validate'))
);
--> statement-breakpoint
CREATE INDEX "policies_organization_id_team_id_is_active_priority_index" ON "governance"."policies" USING btree ("organization_id","team_id","is_active","priority");
--> statement-breakpoint
CREATE INDEX "policies_organization_id_project_id_is_active_priority_index" ON "governance"."policies" USING btree ("organization_id","project_id","is_active","priority");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "governance"."policies" TO skillcanon_app;
