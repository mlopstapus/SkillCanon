import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  PromptNotFoundError,
  PromptVersionNotFoundError,
  type PromptActor,
} from "../domain/prompt";
import { findPromptByOrgAndName, updatePrompt } from "../infrastructure/prompts-repo";
import { findVersionByPromptAndLabel } from "../infrastructure/prompt-versions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Rolls back a prompt's active version to a previously-published version by
 * repointing `active_version_id`. The target version row is never modified.
 */
export async function rollbackPrompt(
  db: Db,
  actor: PromptActor,
  promptName: string,
  targetVersion: string,
) {
  const prompt = await findPromptByOrgAndName(db, actor.organizationId, promptName);
  if (!prompt) {
    throw new PromptNotFoundError(promptName);
  }

  const version = await findVersionByPromptAndLabel(db, prompt.id, targetVersion);
  if (!version) {
    throw new PromptVersionNotFoundError(targetVersion);
  }

  const updated = await updatePrompt(db, prompt.id, { activeVersionId: version.id });
  if (!updated) {
    throw new PromptNotFoundError(promptName);
  }

  return updated;
}
