import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listPromptsByOrg } from "../infrastructure/prompts-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * The *discoverable* set (020-prompt-sharing, FR-019/FR-020/SC-007): every
 * skill in the organization, unfiltered by ownership/subscription — a
 * direct passthrough to the existing, already org-scoped `listPromptsByOrg`
 * (data-model.md's Query Shapes). Distinct from `listPrompts`'s narrower
 * *accessible* set, which governs actual usability for invocation, not
 * visibility.
 */
export async function listSkillsByOrganization(db: Db, organizationId: string) {
  return listPromptsByOrg(db, organizationId);
}
