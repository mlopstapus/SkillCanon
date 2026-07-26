import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { findByOrgAndId, update, type UpdateTeamFields } from "../infrastructure/teams-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface UpdateTeamOptions {
  auditContext?: AuditContext;
}

/**
 * Updates a team's name/description/owner only — never its hierarchy
 * position (FR-004 stays a separate operation from reparenting, FR-008).
 */
export async function updateTeam(
  tx: Tx,
  organizationId: string,
  teamId: string,
  fields: UpdateTeamFields,
  options: UpdateTeamOptions = {},
): Promise<void> {
  const team = await findByOrgAndId(tx, organizationId, teamId);
  if (!team) {
    throw new Error(`No team found with id "${teamId}".`);
  }

  await update(tx, teamId, fields);
  const auditContext = options.auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
  await record(tx, {
    organizationId,
    actorUserId: null,
    actorApiKeyId: null,
    action: "team.updated",
    resourceType: "team",
    resourceId: teamId,
    before: team,
    after: { ...team, ...fields },
    transport: auditContext.transport,
    sourceIp: auditContext.sourceIp ?? null,
  });
}
