import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PromptActor } from "../domain/prompt";
import { listPromptsByOrg } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function listPrompts(db: Db, actor: PromptActor) {
  return listPromptsByOrg(db, actor.organizationId);
}
