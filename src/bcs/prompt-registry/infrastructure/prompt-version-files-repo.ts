import { eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PromptVersionFile } from "../domain/prompt";
import { promptVersionFiles } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertPromptVersionFileParams {
  id: string;
  promptVersionId: string;
  name: string;
  content: string;
  isMain: boolean;
}

/** Inserts every file for a version in one batch — called once, at publish time, inside the caller's transaction. */
export async function insertFiles(tx: Tx, files: InsertPromptVersionFileParams[]) {
  if (files.length === 0) {
    return [];
  }
  return tx.insert(promptVersionFiles).values(files).returning();
}

export async function listFilesByVersionId(db: Tx, promptVersionId: string): Promise<PromptVersionFile[]> {
  const rows = await db
    .select()
    .from(promptVersionFiles)
    .where(eq(promptVersionFiles.promptVersionId, promptVersionId));
  return rows.map((row) => ({ id: row.id, name: row.name, content: row.content, isMain: row.isMain }));
}

/**
 * Batch-fetches files for many versions at once (one query, grouped
 * client-side) — used by the version-read functions in
 * `prompt-versions-repo.ts` to attach each version's `files` array without
 * an N+1 query per version.
 */
export async function listFilesByVersionIds(
  db: Tx,
  promptVersionIds: string[],
): Promise<Map<string, PromptVersionFile[]>> {
  const byVersion = new Map<string, PromptVersionFile[]>();
  if (promptVersionIds.length === 0) {
    return byVersion;
  }
  const rows = await db
    .select()
    .from(promptVersionFiles)
    .where(inArray(promptVersionFiles.promptVersionId, promptVersionIds));
  for (const row of rows) {
    const file: PromptVersionFile = { id: row.id, name: row.name, content: row.content, isMain: row.isMain };
    const existing = byVersion.get(row.promptVersionId);
    if (existing) {
      existing.push(file);
    } else {
      byVersion.set(row.promptVersionId, [file]);
    }
  }
  return byVersion;
}
