import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { findByOrgAndId } from "../infrastructure/projects-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function getProject(db: Db, organizationId: string, projectId: string) {
  return findByOrgAndId(db, organizationId, projectId);
}
