import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { isUniqueViolation } from "@/shared/db";
import { CrossOrgReparentError, DuplicateTeamSlugError } from "../domain/team";
import { NotAuthorizedError, type UserSummary } from "../domain/user";
import { findById, insert, type InsertTeamParams } from "../infrastructure/teams-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface TeamAuditOptions {
  audit?: boolean;
  auditContext?: AuditContext;
  /**
   * Admin-only gate when present (019-account-team-settings-ui); omitted
   * entirely by bootstrap/system callers (e.g. `provisionTeamAndAdmin`),
   * which have no acting user yet and are not reachable via any route.
   */
  actingUser?: UserSummary;
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
  if (options.actingUser && options.actingUser.role !== "admin") {
    throw new NotAuthorizedError();
  }

  if (params.parentTeamId) {
    const parent = await findById(tx, params.parentTeamId);
    if (!parent || parent.organizationId !== params.organizationId) {
      throw new CrossOrgReparentError();
    }
  }

  let result: { id: string };
  try {
    result = await insert(tx, params);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateTeamSlugError();
    }
    throw err;
  }
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
