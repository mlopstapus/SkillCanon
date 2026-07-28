import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { CrossOrgReparentError, CycleError } from "../domain/team";
import { NotAuthorizedError, type UserSummary } from "../domain/user";
import { findById, updateParent } from "../infrastructure/teams-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface ReparentTeamOptions {
  audit?: boolean;
  auditContext?: AuditContext;
}

/**
 * Reparents a team, enforcing: the new parent must belong to the same
 * organization, and the move must not create a cycle. Admin-only
 * (019-account-team-settings-ui).
 */
export async function reparentTeam(
  tx: Tx,
  teamId: string,
  newParentId: string,
  actingUser: UserSummary,
  options: ReparentTeamOptions = {},
): Promise<void> {
  if (actingUser.role !== "admin") {
    throw new NotAuthorizedError();
  }

  const team = await findById(tx, teamId);
  if (!team) {
    throw new Error(`No team found with id "${teamId}".`);
  }

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('team-reparent'), hashtext(${team.organizationId}))`,
  );

  const newParent = await findById(tx, newParentId);
  if (!newParent) {
    throw new Error(`No team found with id "${newParentId}".`);
  }
  if (newParent.organizationId !== team.organizationId) {
    throw new CrossOrgReparentError();
  }

  if (newParentId === teamId) {
    throw new CycleError();
  }

  const seen = new Set<string>();
  let currentId: string | null = newParentId;
  while (currentId && !seen.has(currentId)) {
    if (currentId === teamId) {
      throw new CycleError();
    }
    seen.add(currentId);
    const current = await findById(tx, currentId);
    currentId = current?.parentTeamId ?? null;
  }

  await updateParent(tx, teamId, newParentId);
  if (options.audit !== false) {
    const auditContext = options.auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
    await record(tx, {
      organizationId: team.organizationId,
      actorUserId: null,
      actorApiKeyId: null,
      action: "team.reparented",
      resourceType: "team",
      resourceId: teamId,
      before: team,
      after: { ...team, parentTeamId: newParentId },
      transport: auditContext.transport,
      sourceIp: auditContext.sourceIp ?? null,
    });
  }
}
