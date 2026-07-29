import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { listDistinctActors } from "../infrastructure/audit-events-repo";
import { resolveActorDisplayName } from "./resolve-actor-display-name";

type Db = PostgresJsDatabase<Record<string, never>>;

export interface AuditActorOption {
  actorUserId: string | null;
  actorApiKeyId: string | null;
  displayName: string;
  subtitle: string;
}

/**
 * Powers the Audit Log page's Actor filter dropdown — every distinct actor
 * that actually appears in the organization's currently-retained audit
 * events, including departed members and revoked API keys (020-audit-log-ui
 * Clarifications), not just currently-active org members.
 */
export async function listAuditActorOptions(
  db: Db,
  organizationId: string,
  requestingUserId: string,
  retentionCutoff: Date,
): Promise<AuditActorOption[]> {
  const distinct = await listDistinctActors(db, organizationId, retentionCutoff);
  const resolved = await Promise.all(
    distinct.map(async ({ actorUserId, actorApiKeyId }) => {
      const actor = await resolveActorDisplayName(
        db,
        organizationId,
        requestingUserId,
        actorUserId,
        actorApiKeyId,
      );
      return { actorUserId, actorApiKeyId, displayName: actor.displayName, subtitle: actor.subtitle };
    }),
  );
  return resolved;
}
