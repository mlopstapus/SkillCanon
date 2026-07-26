import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ObjectiveActor } from "../domain/objective";
import { resolveEffectiveObjectives } from "./resolve-effective-objectives";

type Db = PostgresJsDatabase<Record<string, never>>;

export async function resolveAllObjectives(
  db: Db,
  actor: ObjectiveActor,
  userId: string,
  projectId?: string | null,
): Promise<string[]> {
  const effective = await resolveEffectiveObjectives(db, actor, userId, projectId);
  return [
    ...effective.inherited.map((objective) => objective.title),
    ...effective.local.map((objective) => objective.title),
  ];
}
