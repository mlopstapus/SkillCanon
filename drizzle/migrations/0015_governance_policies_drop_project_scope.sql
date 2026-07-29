ALTER TABLE "governance"."policies" DROP CONSTRAINT "policies_exactly_one_scope";--> statement-breakpoint
DROP INDEX "governance"."policies_organization_id_project_id_is_active_priority_index";--> statement-breakpoint
-- PDR-016: Policy is now always team-scoped, never project-scoped. Pre-launch,
-- local dev only, no production data — any existing project-scoped policy
-- rows (team_id IS NULL) have no equivalent under the new model and are
-- dropped rather than backfilled.
DELETE FROM "governance"."policies" WHERE "team_id" IS NULL;--> statement-breakpoint
ALTER TABLE "governance"."policies" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "governance"."policies" DROP COLUMN "project_id";
