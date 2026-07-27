import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listByOrganization, listByTeam } from "../infrastructure/projects-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function listProjectsByOrganization(db: Db, organizationId: string) {
  return listByOrganization(db, organizationId);
}

export async function listProjectsByTeam(db: Db, organizationId: string, teamId: string) {
  return listByTeam(db, organizationId, teamId);
}
