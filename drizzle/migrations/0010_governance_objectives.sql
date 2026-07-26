CREATE TABLE "governance"."objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid,
	"project_id" uuid,
	"user_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"parent_objective_id" uuid,
	"is_inherited" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objectives_not_self_parent" CHECK ("parent_objective_id" IS NULL OR "parent_objective_id" <> "id")
);
--> statement-breakpoint
ALTER TABLE "governance"."objectives" ADD CONSTRAINT "objectives_parent_objective_id_objectives_id_fk" FOREIGN KEY ("parent_objective_id") REFERENCES "governance"."objectives"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "objectives_organization_id_team_id_status_created_at_index" ON "governance"."objectives" USING btree ("organization_id","team_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "objectives_organization_id_project_id_status_created_at_index" ON "governance"."objectives" USING btree ("organization_id","project_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "objectives_organization_id_user_id_status_created_at_index" ON "governance"."objectives" USING btree ("organization_id","user_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "objectives_organization_id_parent_objective_id_index" ON "governance"."objectives" USING btree ("organization_id","parent_objective_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "governance"."objectives" TO skillcanon_app;
