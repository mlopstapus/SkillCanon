import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PromptActor } from "../domain/prompt";
import { findPromptByOrgAndName } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function getPrompt(db: Db, actor: PromptActor, name: string) {
  const row = await findPromptByOrgAndName(db, actor.organizationId, name);
  return row ?? null;
}
