import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ChainStep } from "../domain/skill-chain";
import type { PromptVersionSummary } from "../domain/prompt";
import { listFilesByVersionIds } from "./prompt-version-files-repo";
import { promptVersions } from "./schema";

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface InsertPromptVersionParams {
  id: string;
  promptId: string;
  version: string;
  kind: "template" | "chain";
  systemTemplate: string | null;
  userTemplate: string | null;
  steps: ChainStep[] | null;
  tags: string[];
}

/**
 * Attaches each row's `files` array (032-skill-file-format-refactor) — a
 * legacy-shape or chain-kind version simply gets `files: []`. One batch
 * query regardless of how many rows are given (no N+1).
 */
async function attachFiles(
  tx: Tx,
  rows: Array<Omit<PromptVersionSummary, "files">>,
): Promise<PromptVersionSummary[]> {
  const filesByVersion = await listFilesByVersionIds(
    tx,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, files: filesByVersion.get(row.id) ?? [] }));
}

export async function insertPromptVersion(tx: Tx, params: InsertPromptVersionParams): Promise<PromptVersionSummary> {
  const [row] = await tx.insert(promptVersions).values(params).returning();
  if (!row) {
    throw new Error("PromptVersion insert returned no row.");
  }
  const [withFiles] = await attachFiles(tx, [row]);
  if (!withFiles) {
    throw new Error("PromptVersion insert returned no row.");
  }
  return withFiles;
}

export async function findVersionByPromptAndLabel(
  tx: Tx,
  promptId: string,
  version: string,
): Promise<PromptVersionSummary | null> {
  const [row] = await tx
    .select()
    .from(promptVersions)
    .where(and(eq(promptVersions.promptId, promptId), eq(promptVersions.version, version)));
  if (!row) {
    return null;
  }
  const [withFiles] = await attachFiles(tx, [row]);
  return withFiles ?? null;
}

export async function findVersionById(tx: Tx, versionId: string): Promise<PromptVersionSummary | null> {
  const [row] = await tx
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.id, versionId));
  if (!row) {
    return null;
  }
  const [withFiles] = await attachFiles(tx, [row]);
  return withFiles ?? null;
}

export async function listVersionsByPrompt(tx: Tx, promptId: string): Promise<PromptVersionSummary[]> {
  const rows = await tx
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.promptId, promptId))
    .orderBy(asc(promptVersions.createdAt));
  return attachFiles(tx, rows);
}
