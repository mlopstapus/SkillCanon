import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ProjectNotFoundError } from "../domain/project";
import { findByOrgAndId } from "../infrastructure/projects-repo";
import { listByProject } from "../infrastructure/project-repos-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/** A project's linked repositories — a pure, unauthenticated read, org-scoped via the owning project row. */
export async function listProjectRepos(db: Db, orgId: string, projectId: string) {
  const project = await findByOrgAndId(db, orgId, projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  return listByProject(db, projectId);
}
