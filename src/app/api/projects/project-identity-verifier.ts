import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getOrganization, getTeam, getUser } from "@/bcs/identity-access";
import type { ProjectIdentityVerifier } from "@/bcs/prompt-registry";

type Tx = PostgresJsDatabase<Record<string, never>>;

/**
 * REST-layer `ProjectIdentityVerifier` implementation — composes
 * identity-access's already-exported, throw-on-not-found getters, wrapping
 * each in try/catch to return the boolean this BC's own interface expects.
 * Mirrors `src/app/(app)/projects/project-identity-verifier.ts` (the first
 * real implementation, built for the web UI's server actions) exactly; this
 * is a second, REST-route-layer instance of the same small adapter rather
 * than a shared cross-route-group import, since it's a Distribution-layer
 * wiring concern (adapting one BC's contract to another's interface, D1),
 * not new cross-BC domain logic.
 */
export function makeProjectIdentityVerifier(tx: Tx): ProjectIdentityVerifier {
  return {
    organizationExists: async (orgId) => {
      try {
        await getOrganization(tx, orgId);
        return true;
      } catch {
        return false;
      }
    },
    teamBelongsToOrganization: async (orgId, teamId) => {
      try {
        await getTeam(tx, orgId, teamId);
        return true;
      } catch {
        return false;
      }
    },
    userBelongsToOrganization: async (orgId, userId) => {
      try {
        await getUser(tx, userId, orgId);
        return true;
      } catch {
        return false;
      }
    },
  };
}
