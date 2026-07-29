import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NewAuditEvent, NormalizedAuditEventFilters } from "../domain/audit-event";
import { auditEvents } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export async function insert(tx: Tx, event: NewAuditEvent) {
  const [row] = await tx
    .insert(auditEvents)
    .values({
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      actorApiKeyId: event.actorApiKeyId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      before: event.before ?? null,
      after: event.after ?? null,
      transport: event.transport,
      sourceIp: event.sourceIp ?? null,
    })
    .returning();
  if (!row) {
    throw new Error("Audit event insert returned no row.");
  }
  return row;
}

function buildWhere(organizationId: string, filters: NormalizedAuditEventFilters): SQL {
  const clauses: (SQL | undefined)[] = [
    eq(auditEvents.organizationId, organizationId),
    gte(auditEvents.createdAt, filters.retentionCutoff),
  ];

  if (filters.resourceType) {
    clauses.push(eq(auditEvents.resourceType, filters.resourceType));
  }
  if (filters.actorUserId) {
    clauses.push(eq(auditEvents.actorUserId, filters.actorUserId));
  }
  if (filters.actorApiKeyId) {
    clauses.push(eq(auditEvents.actorApiKeyId, filters.actorApiKeyId));
  }
  if (filters.transport) {
    clauses.push(eq(auditEvents.transport, filters.transport));
  }
  if (filters.createdAtFrom) {
    clauses.push(gte(auditEvents.createdAt, filters.createdAtFrom));
  }
  if (filters.createdAtTo) {
    clauses.push(lte(auditEvents.createdAt, filters.createdAtTo));
  }
  const trimmedSearch = filters.search?.trim();
  if (trimmedSearch) {
    const search = `%${trimmedSearch}%`;
    const searchClauses: SQL[] = [
      ilike(auditEvents.action, search),
      ilike(auditEvents.resourceType, search),
      sql`${auditEvents.resourceId}::text ilike ${search}`,
      sql`${auditEvents.actorUserId}::text ilike ${search}`,
      sql`${auditEvents.actorApiKeyId}::text ilike ${search}`,
    ];
    if (filters.actorUserIds && filters.actorUserIds.length > 0) {
      searchClauses.push(inArray(auditEvents.actorUserId, filters.actorUserIds));
    }
    clauses.push(or(...searchClauses));
  }

  return and(...clauses) as SQL;
}

export async function queryByOrganization(
  tx: Tx,
  organizationId: string,
  filters: NormalizedAuditEventFilters,
) {
  const baseQuery = tx
    .select()
    .from(auditEvents)
    .where(buildWhere(organizationId, filters))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id));

  return baseQuery.limit(filters.limit ?? 2_147_483_647).offset(filters.offset ?? 0);
}

export async function countByOrganization(
  tx: Tx,
  organizationId: string,
  filters: NormalizedAuditEventFilters,
): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(buildWhere(organizationId, filters));
  return row?.count ?? 0;
}

/**
 * Distinct `(actorUserId, actorApiKeyId)` pairs within the retained window
 * — powers the Actor filter's option list (020-audit-log-ui), which must
 * include every actor who actually appears in retained history, not just
 * currently-active org members.
 */
export async function listDistinctActors(
  tx: Tx,
  organizationId: string,
  retentionCutoff: Date,
): Promise<{ actorUserId: string | null; actorApiKeyId: string | null }[]> {
  return tx
    .selectDistinct({
      actorUserId: auditEvents.actorUserId,
      actorApiKeyId: auditEvents.actorApiKeyId,
    })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.organizationId, organizationId), gte(auditEvents.createdAt, retentionCutoff)),
    );
}

/**
 * Distinct `resourceType` values within the retained window — powers the
 * Resource filter's option list with the org's real, currently-retained
 * resource types (never a hardcoded list).
 */
export async function listDistinctResourceTypes(
  tx: Tx,
  organizationId: string,
  retentionCutoff: Date,
): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ resourceType: auditEvents.resourceType })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.organizationId, organizationId), gte(auditEvents.createdAt, retentionCutoff)),
    )
    .orderBy(asc(auditEvents.resourceType));
  return rows.map((row) => row.resourceType);
}

export async function deleteOlderThan(
  tx: Tx,
  organizationId: string,
  cutoff: Date,
): Promise<number> {
  const rows = await tx
    .delete(auditEvents)
    .where(and(eq(auditEvents.organizationId, organizationId), lt(auditEvents.createdAt, cutoff)))
    .returning({ id: auditEvents.id });
  return rows.length;
}
