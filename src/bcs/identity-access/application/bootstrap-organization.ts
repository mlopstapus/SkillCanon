import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, type AuditContext } from "@/bcs/audit-compliance";
import { createOrganization } from "./create-organization";
import type { InsertOrganizationParams } from "../infrastructure/organizations-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export type ProvisionTeamAndAdmin = (
  tx: Tx,
  organizationId: string,
  auditContext?: AuditContext,
) => Promise<{ teamId: string; userId: string }>;

/**
 * Creates the Organization row and runs `provisionTeamAndAdmin` in the same
 * transaction (FR-004) — if the callback throws, the Organization insert
 * rolls back too.
 */
export async function bootstrapOrganization(
  db: PostgresJsDatabase<Record<string, never>>,
  params: InsertOrganizationParams,
  provisionTeamAndAdmin: ProvisionTeamAndAdmin,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<{ organizationId: string; teamId: string; userId: string }> {
  return db.transaction(async (tx) => {
    const { id: organizationId } = await createOrganization(tx, params, {
      auditContext,
    });
    const { teamId, userId } = await provisionTeamAndAdmin(
      tx,
      organizationId,
      auditContext,
    );
    return { organizationId, teamId, userId };
  });
}
