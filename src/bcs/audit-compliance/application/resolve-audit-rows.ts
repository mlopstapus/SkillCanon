import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AuditEvent } from "../domain/audit-event";
import { resolveActorDisplayName, type ResolvedActor } from "./resolve-actor-display-name";
import { resolveResourceDisplayName } from "./resolve-resource-display-name";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface ResolvedAuditRow {
  event: AuditEvent;
  resourceDisplayName: string;
  resourceNameResolved: boolean;
  actor: ResolvedActor;
}

function resourceKey(resourceType: string, resourceId: string | null): string {
  return `${resourceType}::${resourceId ?? ""}`;
}

function actorKey(actorUserId: string | null, actorApiKeyId: string | null): string {
  return `${actorUserId ?? ""}::${actorApiKeyId ?? ""}`;
}

/**
 * Resolves resource/actor display names for a whole page of events at once,
 * deduping by distinct `(resourceType, resourceId)` and distinct
 * `(actorUserId, actorApiKeyId)` so a page of up to `MAX_AUDIT_PAGE_SIZE`
 * rows never issues more resolver calls than there are actually-distinct
 * resources/actors on that page (research.md's N+1-avoidance decision).
 */
export async function resolveAuditRows(
  db: Db,
  organizationId: string,
  requestingUserId: string,
  events: AuditEvent[],
): Promise<ResolvedAuditRow[]> {
  const resourceCache = new Map<string, Promise<{ name: string; resolved: boolean }>>();
  const actorCache = new Map<string, Promise<ResolvedActor>>();

  for (const event of events) {
    const rKey = resourceKey(event.resourceType, event.resourceId);
    if (!resourceCache.has(rKey)) {
      resourceCache.set(
        rKey,
        resolveResourceDisplayName(db, organizationId, requestingUserId, event.resourceType, event.resourceId),
      );
    }
    const aKey = actorKey(event.actorUserId, event.actorApiKeyId);
    if (!actorCache.has(aKey)) {
      actorCache.set(
        aKey,
        resolveActorDisplayName(db, organizationId, requestingUserId, event.actorUserId, event.actorApiKeyId),
      );
    }
  }

  return Promise.all(
    events.map(async (event) => {
      const resource = await resourceCache.get(resourceKey(event.resourceType, event.resourceId))!;
      const actor = await actorCache.get(actorKey(event.actorUserId, event.actorApiKeyId))!;
      return {
        event,
        resourceDisplayName: resource.name,
        resourceNameResolved: resource.resolved,
        actor,
      };
    }),
  );
}
