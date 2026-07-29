ALTER TABLE "prompt_registry"."prompts" ADD COLUMN "owner_type" text;--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompts" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompts" ADD COLUMN "forked_from_skill_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompts" ADD CONSTRAINT "prompts_forked_from_skill_id_prompts_id_fk" FOREIGN KEY ("forked_from_skill_id") REFERENCES "prompt_registry"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- PDR-016: every skill is now owned by exactly one user or team from
-- creation (ownerType/ownerId), never optionally unowned. Pre-launch, local
-- dev only, no production data — unowned rows (user_id IS NULL) have no
-- equivalent under the new model and are dropped; the rest are backfilled
-- as user-owned from their existing user_id.
DELETE FROM "prompt_registry"."prompts" WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "prompt_registry"."prompts" SET "owner_type" = 'user', "owner_id" = "user_id";--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompts" ALTER COLUMN "owner_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompts" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_registry"."prompts" DROP COLUMN "user_id";
