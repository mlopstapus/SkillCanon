import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PromptVersionSummary } from "../domain/prompt";
import { findVersionById } from "../infrastructure/prompt-versions-repo";
import { findPromptByOrgAndId } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Reads one prompt version by id, scoped to `organizationId` via a join
 * through its owning prompt — `prompt_versions` has no `organization_id`
 * column of its own, so org-scoping means verifying the parent prompt
 * resolves in this organization first. A cross-org or nonexistent
 * `versionId` both return `null`.
 */
export async function getPromptVersion(
  db: Db,
  organizationId: string,
  versionId: string,
): Promise<PromptVersionSummary | null> {
  const version = await findVersionById(db, versionId);
  if (!version) {
    return null;
  }
  const prompt = await findPromptByOrgAndId(db, organizationId, version.promptId);
  if (!prompt) {
    return null;
  }
  return version;
}
