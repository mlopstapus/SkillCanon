import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { CrossOrgReparentError } from "../domain/team";
import { findById, insert, type InsertTeamParams } from "../infrastructure/teams-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface TeamAuditOptions {
  audit?: boolean;
  auditContext?: AuditContext;
}

/**
 * Creates a team, optionally nested under a parent team. If a parent is
 * given, it must belong to the same organization as the new team.
 */
export async function createTeam(
  tx: Tx,
  params: InsertTeamParams,
  options: TeamAuditOptions = {},
): Promise<{ id: string }> {
  if (params.parentTeamId) {
    const parent = await findById(tx, params.parentTeamId);
    if (!parent || parent.organizationId !== params.organizationId) {
      throw new CrossOrgReparentError();
    }
  }

  const result = await insert(tx, params);
  if (options.audit !== false) {
    const auditContext = options.auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
    await record(tx, {
      organizationId: params.organizationId,
      actorUserId: null,
      actorApiKeyId: null,
      action: "team.created",
      resourceType: "team",
      resourceId: result.id,
      before: null,
      after: { id: result.id, ...params },
      transport: auditContext.transport,
      sourceIp: auditContext.sourceIp ?? null,
    });
  }
  return result;
}
