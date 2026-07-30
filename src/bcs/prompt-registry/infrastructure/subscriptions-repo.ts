import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { SubscriberType } from "../domain/subscription";
import { subscriptions } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertSubscriptionParams {
  id: string;
  organizationId: string;
  sourceSkillId: string;
  subscriberType: SubscriberType;
  subscriberId: string;
}

export async function insertSubscription(tx: Tx, params: InsertSubscriptionParams) {
  const [row] = await tx.insert(subscriptions).values(params).returning();
  if (!row) {
    throw new Error("Subscription insert returned no row.");
  }
  return row;
}

export async function findBySourceAndSubscriber(
  tx: Tx,
  sourceSkillId: string,
  subscriberType: SubscriberType,
  subscriberId: string,
) {
  const [row] = await tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.sourceSkillId, sourceSkillId),
        eq(subscriptions.subscriberType, subscriberType),
        eq(subscriptions.subscriberId, subscriberId),
      ),
    );
  return row ?? null;
}

export async function findByOrgAndId(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.organizationId, organizationId), eq(subscriptions.id, id)));
  return row ?? null;
}

export async function deleteById(tx: Tx, id: string) {
  const [row] = await tx.delete(subscriptions).where(eq(subscriptions.id, id)).returning();
  return row ?? null;
}

export async function listBySubscriber(
  tx: Tx,
  organizationId: string,
  subscriberType: SubscriberType,
  subscriberId: string,
) {
  return tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        eq(subscriptions.subscriberType, subscriberType),
        eq(subscriptions.subscriberId, subscriberId),
      ),
    );
}
