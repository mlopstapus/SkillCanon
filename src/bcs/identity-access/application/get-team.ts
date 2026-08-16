import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { CrossOrgTeamAccessError, type Team } from "../domain/team";
import { findByOrgAndId } from "../infrastructure/teams-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

/**
 * Reads one team's full detail, scoped to `organizationId` — a cross-org or
 * nonexistent `teamId` is rejected the same way (M3), matching `updateTeam`'s
 * existing convention (019-account-team-settings-ui).
 */
export async function getTeam(
  db: Tx,
  organizationId: string,
  teamId: string,
): Promise<Team> {
  const row = await findByOrgAndId(db, organizationId, teamId);
  if (!row) {
    throw new CrossOrgTeamAccessError();
  }
  return row;
}
