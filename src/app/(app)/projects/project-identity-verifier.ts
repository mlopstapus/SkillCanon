import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getOrganization, getTeam, getUser } from "@/bcs/identity-access";
import type { ProjectIdentityVerifier } from "@/bcs/prompt-registry";

type Tx = PostgresJsDatabase<Record<string, never>>;

/**
 * The first real (non-test) `ProjectIdentityVerifier` implementation
 * (023-prompt-registry-views-ui) — composes identity-access's already-
 * exported, throw-on-not-found getters, wrapping each in try/catch to
 * return the boolean this BC's own interface expects. Takes the caller's
 * already-tenant-scoped `tx` directly (constructed from *inside* the same
 * `withTenantContext` block the mutation itself runs in) rather than
 * opening its own separate connection/transaction. Lives at the route
 * layer, not inside `prompt-registry`, since it adapts one BC's contract to
 * another's interface — a Distribution-layer wiring concern, not new
 * cross-BC domain logic (D1).
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
