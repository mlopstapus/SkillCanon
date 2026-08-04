import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface SyncManifest {
  stubs: Record<string, string>;
}

const SYNC_MANIFEST_RELATIVE_PATH = join(".skillcanon", "sync-manifest.json");

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function readSyncManifest(repoRoot: string): SyncManifest {
  const path = join(repoRoot, SYNC_MANIFEST_RELATIVE_PATH);
  if (!existsSync(path)) {
    return { stubs: {} };
  }
  return JSON.parse(readFileSync(path, "utf8")) as SyncManifest;
}

export function writeSyncManifest(repoRoot: string, manifest: SyncManifest): void {
  const dir = join(repoRoot, ".skillcanon");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(repoRoot, SYNC_MANIFEST_RELATIVE_PATH), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
