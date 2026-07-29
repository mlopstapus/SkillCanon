import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PromptSummary } from "../domain/prompt";
import { findPromptByOrgAndId } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Reads one prompt by id, scoped to `organizationId` — a cross-org or
 * nonexistent `promptId` both return `null`, matching this BC's other
 * `findByOrgAndId`-backed getters. Distinct from the existing `getPrompt`,
 * which looks a prompt up by its unique `(organizationId, name)` pair
 * instead of its id.
 */
export async function getPromptById(
  db: Db,
  organizationId: string,
  promptId: string,
): Promise<PromptSummary | null> {
  return findPromptByOrgAndId(db, organizationId, promptId);
}
