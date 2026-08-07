-- 032-skill-file-format-refactor (PDR-018): expand()'s response shape
-- collapses from a systemMessage/userMessage pair to a single `content`
-- string. skill_chain_run_steps stores exactly what expand() returned for
-- that step (start-skill-chain-run.ts/advance-skill-chain-run.ts), so it
-- follows the same shape change. No existing rows to migrate (skill chains
-- are new-shape-only from the moment they resolve through the new
-- expand()) — a straight drop-and-add, not a rename.

ALTER TABLE "prompt_registry"."skill_chain_run_steps" DROP COLUMN "system_message";
--> statement-breakpoint
ALTER TABLE "prompt_registry"."skill_chain_run_steps" DROP COLUMN "user_message";
--> statement-breakpoint
ALTER TABLE "prompt_registry"."skill_chain_run_steps" ADD COLUMN "content" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "prompt_registry"."skill_chain_run_steps" ALTER COLUMN "content" DROP DEFAULT;
