import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Subscription } from "../domain/subscription";
import { findByOrgAndId } from "../infrastructure/subscriptions-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Reads one subscription by id, scoped to `organizationId` — a cross-org or
 * nonexistent `subscriptionId` both return `null`, matching this BC's other
 * `findByOrgAndId`-backed getters (`getProject`, `getPromptById`).
 */
export async function getSubscription(
  db: Db,
  organizationId: string,
  subscriptionId: string,
): Promise<Subscription | null> {
  return findByOrgAndId(db, organizationId, subscriptionId);
}
