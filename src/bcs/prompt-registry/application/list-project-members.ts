import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listByProject } from "../infrastructure/project-members-repo";
import { findByOrgAndId } from "../infrastructure/projects-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function listProjectMembers(db: Db, organizationId: string, projectId: string) {
  const project = await findByOrgAndId(db, organizationId, projectId);
  if (!project) {
    return [];
  }
  return listByProject(db, projectId);
}
