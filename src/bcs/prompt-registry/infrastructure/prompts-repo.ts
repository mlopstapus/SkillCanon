import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { prompts } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertPromptParams {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDeprecated: boolean;
  activeVersionId: string | null;
  userId: string | null;
}

export async function insertPrompt(tx: Tx, params: InsertPromptParams) {
  const [row] = await tx.insert(prompts).values(params).returning();
  if (!row) {
    throw new Error("Prompt insert returned no row.");
  }
  return row;
}

export async function findPromptByOrgAndName(tx: Tx, organizationId: string, name: string) {
  const [row] = await tx
    .select()
    .from(prompts)
    .where(and(eq(prompts.organizationId, organizationId), eq(prompts.name, name)));
  return row ?? null;
}

export async function findPromptByOrgAndId(tx: Tx, organizationId: string, promptId: string) {
  const [row] = await tx
    .select()
    .from(prompts)
    .where(and(eq(prompts.organizationId, organizationId), eq(prompts.id, promptId)));
  return row ?? null;
}

export async function listPromptsByOrg(tx: Tx, organizationId: string) {
  return tx.select().from(prompts).where(eq(prompts.organizationId, organizationId)).orderBy(asc(prompts.name));
}

export async function updatePrompt(
  tx: Tx,
  promptId: string,
  fields: Partial<{
    isDeprecated: boolean;
    activeVersionId: string | null;
    description: string | null;
  }>,
) {
  const [row] = await tx
    .update(prompts)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(prompts.id, promptId))
    .returning();
  return row ?? null;
}
