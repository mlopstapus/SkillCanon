import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { promptVersions } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertPromptVersionParams {
  id: string;
  promptId: string;
  version: string;
  systemTemplate: string | null;
  userTemplate: string | null;
  inputSchema: Record<string, unknown>;
  tags: string[];
}

export async function insertPromptVersion(tx: Tx, params: InsertPromptVersionParams) {
  const [row] = await tx.insert(promptVersions).values(params).returning();
  if (!row) {
    throw new Error("PromptVersion insert returned no row.");
  }
  return row;
}

export async function findVersionByPromptAndLabel(
  tx: Tx,
  promptId: string,
  version: string,
) {
  const [row] = await tx
    .select()
    .from(promptVersions)
    .where(and(eq(promptVersions.promptId, promptId), eq(promptVersions.version, version)));
  return row ?? null;
}

export async function findVersionById(tx: Tx, versionId: string) {
  const [row] = await tx
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.id, versionId));
  return row ?? null;
}

export async function listVersionsByPrompt(tx: Tx, promptId: string) {
  return tx
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.promptId, promptId))
    .orderBy(asc(promptVersions.createdAt));
}
