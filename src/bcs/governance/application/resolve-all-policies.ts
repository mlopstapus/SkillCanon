import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { EffectivePolicy, PolicyActor } from "../domain/policy";
import { resolveEffectivePolicies } from "./resolve-effective-policies";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function resolveAllPolicies(
  db: Db,
  actor: PolicyActor,
  userId: string,
  projectId?: string | null,
): Promise<EffectivePolicy[]> {
  const effective = await resolveEffectivePolicies(db, actor, userId, projectId);
  return [...effective.inherited, ...effective.local].sort(
    (a, b) => b.priority - a.priority || Number(b.isInherited) - Number(a.isInherited),
  );
}
