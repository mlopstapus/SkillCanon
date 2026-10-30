import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { count } from "../infrastructure/organizations-repo";

/**
 * True once first-run setup has created the instance's organization. Needs the
 * credential-resolution connection (`authDb`): no organization context exists yet.
 */
export async function isInstanceSetUp(db: PostgresJsDatabase<Record<string, never>>): Promise<boolean> {
  return (await count(db)) > 0;
}
