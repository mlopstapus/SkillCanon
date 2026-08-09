import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface SyncManifest {
  /** slug -> filename -> content hash (033-skill-file-format-cli-support: one hash per synced file, not one per skill). */
  stubs: Record<string, Record<string, string>>;
}

const SYNC_MANIFEST_RELATIVE_PATH = join(".skillcanon", "sync-manifest.json");

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * A pre-033 manifest entry is a bare string (one hash per skill). Such an
 * entry is treated as absent rather than migrated — it's a disposable local
 * cache, so the next `sync` just recreates it in the new per-file shape
 * (research.md §2).
 */
export function readSyncManifest(repoRoot: string): SyncManifest {
  const path = join(repoRoot, SYNC_MANIFEST_RELATIVE_PATH);
  if (!existsSync(path)) {
    return { stubs: {} };
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as { stubs: Record<string, unknown> };
  const stubs: Record<string, Record<string, string>> = {};
  for (const [slug, value] of Object.entries(raw.stubs ?? {})) {
    if (typeof value === "string") continue;
    stubs[slug] = value as Record<string, string>;
  }
  return { stubs };
}

export function writeSyncManifest(repoRoot: string, manifest: SyncManifest): void {
  const dir = join(repoRoot, ".skillcanon");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(repoRoot, SYNC_MANIFEST_RELATIVE_PATH), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
