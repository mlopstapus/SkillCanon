import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Team } from "../domain/team";
import { findAllByOrg } from "../infrastructure/teams-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

/**
 * Lists every team in `organizationId`, flat, with full detail — the whole
 * hierarchy in one query, so a client-side tree can show any selected
 * team's full detail without a further round-trip
 * (019-account-team-settings-ui). Unrestricted: browsing the hierarchy has
 * no role gate (spec.md's FR-001 and its edge cases).
 */
export async function listTeams(
  db: Tx,
  organizationId: string,
): Promise<Team[]> {
  return findAllByOrg(db, organizationId);
}
