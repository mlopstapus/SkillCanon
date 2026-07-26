import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listUsers, type UserSummary } from "@/bcs/identity-access";
import {
  type AuditEventFilters,
  type AuditEventPage,
  type ListAuditEventsOptions,
  normalizeAuditPagination,
  resolveAuditEntitlements,
  retentionCutoff,
} from "../domain/audit-event";
import { countByOrganization, queryByOrganization } from "../infrastructure/audit-events-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

async function resolveActorUserIdsByDisplayName(
  db: Db,
  organizationId: string,
  requestingUserId: string,
  search: string | undefined,
): Promise<string[] | undefined> {
  const trimmed = search?.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  const actingUser: UserSummary = {
    id: requestingUserId,
    orgId: organizationId,
    teamId: "",
    role: "member",
    email: "",
  };
  const users = await listUsers(db, actingUser);
  return users
    .filter((user) => user.displayName.toLowerCase().includes(trimmed))
    .map((user) => user.id);
}

export async function listAuditEvents(
  db: Db,
  organizationId: string,
  filters: AuditEventFilters = {},
  options: ListAuditEventsOptions,
): Promise<AuditEventPage> {
  const entitlements = resolveAuditEntitlements();
  const now = options.now ?? new Date();
  const pagination = normalizeAuditPagination(filters);
  const actorUserIds = await resolveActorUserIdsByDisplayName(
    db,
    organizationId,
    options.requestingUserId,
    filters.search,
  );
  const normalized = {
    ...filters,
    retentionCutoff: retentionCutoff(now, entitlements.auditRetentionDays),
    actorUserIds,
    limit: pagination.limit,
    offset: pagination.offset,
  };

  const [items, total] = await Promise.all([
    queryByOrganization(db, organizationId, normalized),
    countByOrganization(db, organizationId, normalized),
  ]);

  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    retentionDays: entitlements.auditRetentionDays,
  };
}
