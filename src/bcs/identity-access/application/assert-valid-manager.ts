import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { InvalidManagerError, ManagerCycleError } from "../domain/user";
import { findByOrgAndId } from "../infrastructure/users-repo";

type Tx = PostgresJsDatabase<Record<string, never>>;

const MAX_CHAIN = 1000;

/**
 * A manager must be another user of the same organization, and must not
 * already report (directly or through others) to `subjectId`. `subjectId` is
 * null for a user being created (nothing can report to them yet).
 */
export async function assertValidManager(
  tx: Tx,
  organizationId: string,
  subjectId: string | null,
  managerId: string,
): Promise<void> {
  if (managerId === subjectId) {
    throw new InvalidManagerError("A person cannot report to themselves.");
  }
  const manager = await findByOrgAndId(tx, organizationId, managerId);
  if (!manager) {
    throw new InvalidManagerError();
  }
  if (subjectId === null) {
    return;
  }

  const loop: string[] = [];
  let current: typeof manager | undefined = manager;
  for (let i = 0; current && i < MAX_CHAIN; i++) {
    loop.push(current.displayName);
    if (current.managerId === subjectId) {
      const subject = await findByOrgAndId(tx, organizationId, subjectId);
      const name = subject?.displayName ?? "this person";
      throw new ManagerCycleError([name, ...loop, name]);
    }
    current = current.managerId ? await findByOrgAndId(tx, organizationId, current.managerId) : undefined;
  }
}
