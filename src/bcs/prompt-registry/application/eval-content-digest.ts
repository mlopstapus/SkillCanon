import { createHash } from "node:crypto";
import type { PromptVersionSummary } from "../domain/prompt";

/**
 * SHA-256 (hex) of a version's own files (name + content, name-sorted). Eval
 * results are keyed by this and never compared across different digests.
 * Distinct from a serve's digest (016/001), which covers governed output.
 */
export function versionContentDigest(version: PromptVersionSummary): string {
  const hash = createHash("sha256");
  for (const f of [...version.files].sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(`${f.name}\0${f.content}\0`);
  }
  return hash.digest("hex");
}
