-- 036-external-skill-import (013-skill-import-and-external-registries):
-- provenance for a skill imported from an external GitHub source. Nullable —
-- a skill authored directly in SkillCanon has no source_url. Set once at
-- import time and never changed afterward.

ALTER TABLE "prompt_registry"."prompts" ADD COLUMN "source_url" text;
