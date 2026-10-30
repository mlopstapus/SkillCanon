import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { count } from "../infrastructure/organizations-repo";

type Db = PostgresJsDatabase<Record<string, never>>;

/** True once the instance's organization exists; first-run setup is closed from then on (018/002). */
export async function isInstanceSetUp(db: Db): Promise<boolean> {
  return (await count(db)) > 0;
}
