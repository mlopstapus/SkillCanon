import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ProjectNotFoundError } from "../domain/project";
import { findByOrgAndId } from "../infrastructure/projects-repo";
import { listByProject } from "../infrastructure/project-teams-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * A project's collaborator teams — does **not** include the owner team
 * itself (that's `projects.team_id`, not a row in `project_teams`; see
 * `data-model.md`). Org-scoped via the owning project row.
 */
export async function listProjectTeams(db: Db, orgId: string, projectId: string) {
  const project = await findByOrgAndId(db, orgId, projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  return listByProject(db, projectId);
}
