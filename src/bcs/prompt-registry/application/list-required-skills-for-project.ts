import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listRequiredSkillNamesByProject } from "../infrastructure/project-skill-assignments-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Flat list of skill names assigned `required` to a project
 * (022-project-skill-assignment, PDR-016). A direct catalog read — no
 * team-chain resolution, no caller/actor parameter — this is what VCS
 * Integration's PR check reads directly (FR-009/FR-010/FR-011).
 */
export async function listRequiredSkillsForProject(db: Db, orgId: string, projectId: string) {
  return listRequiredSkillNamesByProject(db, orgId, projectId);
}
