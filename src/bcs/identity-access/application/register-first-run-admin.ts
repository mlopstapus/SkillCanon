import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_WEB_AUDIT_CONTEXT, type AuditContext } from "@/bcs/audit-compliance";
import { bootstrapOrganization } from "./bootstrap-organization";
import { assertCoreFeaturesEnabled } from "./entitlement-gate";
import { makeProvisionTeamAndAdmin } from "./provision-team-and-admin";

export interface RegisterFirstRunAdminParams {
  organization: { name: string; slug: string };
  team: { name: string; slug: string };
  admin: {
    username: string;
    displayName?: string;
    email: string;
    password: string;
  };
}

/**
 * First-run registration composition (FR-010/FR-011): checks the
 * entitlement gate stand-in before doing any work.
 */
export async function registerFirstRunAdmin(
  db: PostgresJsDatabase<Record<string, never>>,
  params: RegisterFirstRunAdminParams,
  auditContext: AuditContext = DEFAULT_WEB_AUDIT_CONTEXT,
): Promise<{ organizationId: string; teamId: string; userId: string }> {
  assertCoreFeaturesEnabled();

  return bootstrapOrganization(
    db,
    params.organization,
    makeProvisionTeamAndAdmin({ team: params.team, admin: params.admin }),
    auditContext,
  );
}
