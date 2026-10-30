import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { isInstanceSetUp, registerFirstRunAdmin } from "@/bcs/identity-access";

type Db = PostgresJsDatabase<Record<string, never>>;
type RegisterInput = Parameters<typeof registerFirstRunAdmin>[1];

/**
 * First-run setup, and only that. Once the instance has its organization this
 * refuses in every deployment mode (the organization guard in
 * `createOrganization` is mode-conditional; this one is not), so a second
 * organization cannot be created through the register action. Throws the same
 * `SecondOrganizationNotAllowedError` name the action already maps to "blocked".
 */
export async function registerInstance(db: Db, input: RegisterInput) {
  if (await isInstanceSetUp(db)) {
    const err = new Error("This instance already has its organization; access is by invitation.");
    err.name = "SecondOrganizationNotAllowedError";
    throw err;
  }
  return registerFirstRunAdmin(db, input);
}
