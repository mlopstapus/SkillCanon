-- Canonical version label has no leading "v" (specs/041-normalise-version-labels).
-- A prompt that already has the unprefixed label keeps its "v" row (unique constraint);
-- lookups still match that legacy row.
UPDATE "prompt_registry"."prompt_versions" pv
SET "version" = substr(pv."version", 2)
WHERE pv."version" ~ '^[vV][0-9]'
  AND NOT EXISTS (
    SELECT 1 FROM "prompt_registry"."prompt_versions" o
    WHERE o."prompt_id" = pv."prompt_id" AND o."version" = substr(pv."version", 2)
  );
--> statement-breakpoint
UPDATE "prompt_registry"."skill_chain_run_steps"
SET "prompt_version" = substr("prompt_version", 2)
WHERE "prompt_version" ~ '^[vV][0-9]';
--> statement-breakpoint
UPDATE "distribution"."prompt_usage"
SET "prompt_version" = substr("prompt_version", 2)
WHERE "prompt_version" ~ '^[vV][0-9]';
