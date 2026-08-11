/**
 * Local Folder Skill Upload (013-skill-import-and-external-registries/002,
 * spec 037-local-folder-skill-upload). Detects skill folders inside a set of
 * already-read local files (already narrowed client-side to files sitting
 * inside a candidate directory — FR-012) and validates/flags them, mirroring
 * `external-skill-source.ts`'s GitHub-fetch candidate-building shape but
 * with no I/O of its own: every file's content is already provided.
 */

import { MAX_FILE_SIZE_BYTES, MAX_SUPPORTING_FILES } from "./prompt";
import { parseSkillFrontmatter } from "./external-skill-source";

export interface LocalSkillFileEntry {
  /** Path relative to the user's selected root folder, forward-slash separated. */
  relativePath: string;
  content: string;
}

/** One detected skill folder, ready to hand to createPrompt/publishVersion. */
export interface LocalSkillCandidate {
  /** Derived from SKILL.md frontmatter `name:` if present, else the containing directory's name. */
  name: string;
  description: string;
  mainFile: { name: "SKILL.md"; content: string };
  supportingFiles: Array<{ name: string; content: string }>;
  /** The candidate directory's relativePath — lets the preview UI distinguish two same-named candidates. */
  folderPath: string;
}

export interface LocalSkillInvalidFolder {
  folderPath: string;
  reason: string;
}

export interface LocalSkillScanResult {
  candidates: LocalSkillCandidate[];
  /** Names shared by two or more entries in `candidates` (FR-013). */
  duplicateNames: Set<string>;
  /** Directories that had a SKILL.md but failed validation (FR-010). */
  invalidFolders: LocalSkillInvalidFolder[];
}

function byteLength(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

/** `"a/b/SKILL.md"` -> `"a/b"`; `"SKILL.md"` -> `""` (root selection is itself the skill folder). */
function parentDirectory(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : relativePath.slice(0, lastSlash);
}

function basename(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf("/");
  return lastSlash === -1 ? relativePath : relativePath.slice(lastSlash + 1);
}

/**
 * Scans already-read local file entries for skill folders: any file whose
 * basename is exactly `SKILL.md` marks its parent directory as a candidate
 * (research.md's detection rule) — applied uniformly regardless of nesting
 * depth, so a bare selected skill folder, `.claude/skills/*`,
 * `.agents/skills/*`, or any other container convention are all handled by
 * the same rule. A candidate's supporting files are every other *direct*
 * (non-recursive) file sibling of its SKILL.md.
 *
 * "No usable name" (FR-010's other named example, beyond empty/oversized
 * content) is not a reachable invalid case here — `parseSkillFrontmatter`
 * always falls back to the containing directory's name, which can never be
 * empty for a real relativePath. Invalidity is therefore always an empty or
 * oversized main file, mirroring `external-skill-source.ts`'s own
 * `buildCandidate` (which returns `null`, not a distinct "bad name" case,
 * for the same reasons).
 */
export function scanLocalSkillFolders(entries: LocalSkillFileEntry[]): LocalSkillScanResult {
  const byDirectory = new Map<string, LocalSkillFileEntry[]>();
  for (const entry of entries) {
    const dir = parentDirectory(entry.relativePath);
    const list = byDirectory.get(dir);
    if (list) {
      list.push(entry);
    } else {
      byDirectory.set(dir, [entry]);
    }
  }

  const candidates: LocalSkillCandidate[] = [];
  const invalidFolders: LocalSkillInvalidFolder[] = [];

  for (const [dir, files] of byDirectory) {
    const skillMd = files.find((f) => basename(f.relativePath) === "SKILL.md");
    if (!skillMd) continue;

    if (skillMd.content.length === 0) {
      invalidFolders.push({ folderPath: dir, reason: "SKILL.md is empty." });
      continue;
    }
    if (byteLength(skillMd.content) > MAX_FILE_SIZE_BYTES) {
      invalidFolders.push({ folderPath: dir, reason: `SKILL.md exceeds the ${MAX_FILE_SIZE_BYTES}-byte limit.` });
      continue;
    }

    const fallbackName = dir === "" ? "skill" : basename(dir);
    const { name, description } = parseSkillFrontmatter(skillMd.content, fallbackName);

    const supportingFiles = files
      .filter((f) => f !== skillMd)
      .slice(0, MAX_SUPPORTING_FILES)
      .map((f) => ({ name: basename(f.relativePath), content: f.content }));

    candidates.push({
      name,
      description,
      mainFile: { name: "SKILL.md", content: skillMd.content },
      supportingFiles,
      folderPath: dir,
    });
  }

  const nameCounts = new Map<string, number>();
  for (const candidate of candidates) {
    nameCounts.set(candidate.name, (nameCounts.get(candidate.name) ?? 0) + 1);
  }
  const duplicateNames = new Set(
    [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name),
  );

  return { candidates, duplicateNames, invalidFolders };
}
