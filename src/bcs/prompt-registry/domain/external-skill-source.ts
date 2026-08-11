/**
 * External Skill Registry Import (013-skill-import-and-external-registries,
 * spec 036-external-skill-import). Reading someone else's publicly-published
 * skill and mapping it straight into SkillCanon's own file-bundle shape
 * (032-skill-file-format-refactor) — no repo-ownership requirement, no
 * transform beyond parsing the same SKILL.md-plus-files folder convention
 * this product already uses for its own skills.
 */

export interface ExternalSkillFile {
  name: string;
  content: string;
}

/** One skill folder found at the source, ready to hand to createPrompt/publishVersion. */
export interface ExternalSkillCandidate {
  /** Derived from SKILL.md frontmatter `name:` if present, else the folder name. */
  name: string;
  description: string;
  mainFile: ExternalSkillFile;
  supportingFiles: ExternalSkillFile[];
}

export interface ExternalSkillSourceResult {
  /** The normalized owner/repo[/path] this was resolved from. */
  source: string;
  skills: ExternalSkillCandidate[];
}

/** GitHub repositories only for v1 (spec Assumptions) — no other named public registry exists yet. */
export class InvalidExternalSourceError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "InvalidExternalSourceError";
  }
}

/** Nothing importable found at an otherwise-reachable source (FR-011). */
export class ExternalSourceNotFoundError extends Error {
  constructor(source: string) {
    super(`No skill content found at "${source}". Expected a SKILL.md file at the repository root, under a "skills/" directory, or in a top-level subdirectory.`);
    this.name = "ExternalSourceNotFoundError";
  }
}

/** The source itself is unreachable — private/deleted repo, network failure, rate limit (FR-012). */
export class ExternalSourceUnreachableError extends Error {
  constructor(source: string, detail: string) {
    super(`Could not reach "${source}": ${detail}`);
    this.name = "ExternalSourceUnreachableError";
  }
}

/** Enforced on every fetched file, mirroring publishVersion's own file-bundle limits (FR-010). */
export const MAX_EXTERNAL_SKILLS_PER_SOURCE = 25;

/**
 * Parses `SKILL.md`'s frontmatter for `name:`/`description:` (the same
 * convention this repo's own `.claude/skills/*` folders and the Claude Code
 * skill format use). Falls back to the given folder name / empty string
 * when frontmatter is absent or a field is missing — never throws, since a
 * skill's own instructions body may legitimately omit either.
 */
export function parseSkillFrontmatter(
  skillMdContent: string,
  fallbackName: string,
): { name: string; description: string } {
  const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMdContent);
  let name = fallbackName;
  let description = "";
  if (frontmatterMatch) {
    const body = frontmatterMatch[1] ?? "";
    const nameMatch = /^name:\s*(.+)$/m.exec(body);
    const descMatch = /^description:\s*(.+)$/m.exec(body);
    if (nameMatch?.[1]) name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
    if (descMatch?.[1]) description = descMatch[1].trim().replace(/^["']|["']$/g, "");
  }
  if (!description) {
    // Fall back to the first non-empty, non-heading, non-frontmatter line.
    const bodyStart = frontmatterMatch ? skillMdContent.slice(frontmatterMatch[0].length) : skillMdContent;
    const firstLine = bodyStart
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("#"));
    description = firstLine ?? "";
  }
  return { name, description };
}
