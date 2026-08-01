import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listByOrganization } from "../infrastructure/project-skill-assignments-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Every project-skill assignment in the organization, flat — the reverse
 * index `listByProject` doesn't provide. Powers the Prompts list page's
 * "which project(s) is this prompt in" column (023-prompt-registry-views-ui
 * FR-001); a pure, unauthenticated read like `listProjectTeams`.
 */
export async function listProjectSkillAssignmentsForOrganization(db: Db, organizationId: string) {
  return listByOrganization(db, organizationId);
}
