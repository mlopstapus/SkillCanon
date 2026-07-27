import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { PromptNotFoundError, type PromptActor } from "../domain/prompt";
import { findPromptByOrgAndName, updatePrompt } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function deprecatePrompt(db: Db, actor: PromptActor, promptName: string) {
  const prompt = await findPromptByOrgAndName(db, actor.organizationId, promptName);
  if (!prompt) {
    throw new PromptNotFoundError(promptName);
  }
  const updated = await updatePrompt(db, prompt.id, { isDeprecated: true });
  if (!updated) {
    throw new PromptNotFoundError(promptName);
  }
  return updated;
}
