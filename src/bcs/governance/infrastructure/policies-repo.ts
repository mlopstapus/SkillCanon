import { and, count, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PolicyEnforcementType, UpdatePolicyFields } from "../domain/policy";
import { policies } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertPolicyParams {
  id: string;
  organizationId: string;
  teamId: string;
  name: string;
  description: string | null;
  enforcementType: PolicyEnforcementType;
  content: string;
  priority: number;
}

export async function insert(tx: Tx, params: InsertPolicyParams) {
  const [row] = await tx
    .insert(policies)
    .values({ ...params, isActive: true })
    .returning();
  if (!row) {
    throw new Error("Policy insert returned no row.");
  }
  return row;
}

export async function findByOrgAndId(tx: Tx, organizationId: string, policyId: string) {
  const [row] = await tx
    .select()
    .from(policies)
    .where(and(eq(policies.organizationId, organizationId), eq(policies.id, policyId)));
  return row;
}

export async function update(
  tx: Tx,
  organizationId: string,
  policyId: string,
  fields: UpdatePolicyFields,
) {
  const [row] = await tx
    .update(policies)
    .set(fields)
    .where(and(eq(policies.organizationId, organizationId), eq(policies.id, policyId)))
    .returning();
  return row;
}

export async function deactivate(tx: Tx, organizationId: string, policyId: string) {
  const [row] = await tx
    .update(policies)
    .set({ isActive: false })
    .where(and(eq(policies.organizationId, organizationId), eq(policies.id, policyId)))
    .returning();
  return row;
}

export async function listActiveByTeam(tx: Tx, organizationId: string, teamId: string) {
  return tx
    .select()
    .from(policies)
    .where(
      and(
        eq(policies.organizationId, organizationId),
        eq(policies.teamId, teamId),
        eq(policies.isActive, true),
      ),
    )
    .orderBy(desc(policies.priority));
}

export async function countActiveByTeam(tx: Tx, organizationId: string, teamId: string): Promise<number> {
  const [row] = await tx
    .select({ count: count() })
    .from(policies)
    .where(
      and(
        eq(policies.organizationId, organizationId),
        eq(policies.teamId, teamId),
        eq(policies.isActive, true),
      ),
    );
  return Number(row?.count ?? 0);
}
