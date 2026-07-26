import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  DEFAULT_WEB_AUDIT_CONTEXT,
  record,
  type AuditContext,
} from "@/bcs/audit-compliance";
import { createTeam } from "./create-team";
import { reparentTeam } from "./reparent-team";
import { findById } from "../infrastructure/teams-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertTeamBetweenParams {
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  ownerId?: string;
}

export interface InsertTeamBetweenOptions {
  auditContext?: AuditContext;
}

/**
 * Creates a new team taking `childTeamId`'s current parent position, then
 * reparents `childTeamId` under the new team.
 */
export async function insertTeamBetween(
  tx: Tx,
  params: InsertTeamBetweenParams,
  childTeamId: string,
  options: InsertTeamBetweenOptions = {},
): Promise<{ id: string }> {
  const child = await findById(tx, childTeamId);
  if (!child) {
    throw new Error(`No team found with id "${childTeamId}".`);
  }

  const inserted = await createTeam(
    tx,
    {
      ...params,
      parentTeamId: child.parentTeamId ?? undefined,
    },
    { audit: false },
  );

  await reparentTeam(tx, childTeamId, inserted.id, { audit: false });

  const auditContext = options.auditContext ?? DEFAULT_WEB_AUDIT_CONTEXT;
  await record(tx, {
    organizationId: params.organizationId,
    actorUserId: null,
    actorApiKeyId: null,
    action: "team.reparented",
    resourceType: "team",
    resourceId: inserted.id,
    before: { childTeamId, previousParentTeamId: child.parentTeamId },
    after: { insertedTeamId: inserted.id, childTeamId, parentTeamId: inserted.id },
    transport: auditContext.transport,
    sourceIp: auditContext.sourceIp ?? null,
  });

  return inserted;
}
