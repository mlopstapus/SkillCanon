import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { PromptNotFoundError, type PromptActor } from "../domain/prompt";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";
import { listVersionsByPrompt } from "../infrastructure/prompt-versions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function listVersions(db: Db, actor: PromptActor, promptName: string) {
  const prompt = await findPromptByOrgAndName(db, actor.organizationId, promptName);
  if (!prompt) {
    throw new PromptNotFoundError(promptName);
  }
  return listVersionsByPrompt(db, prompt.id);
}
