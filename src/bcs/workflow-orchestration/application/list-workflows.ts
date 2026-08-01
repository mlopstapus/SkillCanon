import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { UserSummary } from "@/bcs/identity-access";
import { NotAuthorizedError, type ListWorkflowsFilter } from "../domain/workflow";
import { listByOrg, listByOrgAndProject, listByOrgAndUser } from "../infrastructure/workflows-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Self-or-admin (FR-017, FR-018): a non-admin may only use `scope: "self"`
 * (optionally narrowed by project); any other scope is admin-only.
 */
export async function listWorkflows(db: Db, actingUser: UserSummary, filter: ListWorkflowsFilter) {
  const isAdmin = actingUser.role === "admin";

  if (filter.scope !== "self" && !isAdmin) {
    throw new NotAuthorizedError();
  }

  switch (filter.scope) {
    case "self":
      return listByOrgAndUser(db, actingUser.orgId, actingUser.id, filter.projectId);
    case "user":
      return listByOrgAndUser(db, actingUser.orgId, filter.userId, filter.projectId);
    case "project":
      return listByOrgAndProject(db, actingUser.orgId, filter.projectId);
    case "organization":
      return listByOrg(db, actingUser.orgId);
  }
}
