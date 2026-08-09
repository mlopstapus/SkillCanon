export interface SkillFileMetadata {
  name: string;
  description: string;
}

export interface MainFileInput extends SkillFileMetadata {
  slug: string;
  /** The skill's real authored main-file content (033-skill-file-format-cli-support) — empty/absent for a no-content skill, use `renderPointerStub` instead. */
  content: string;
}

/**
 * Lowercase, kebab-case slug derived from a prompt's own name
 * (data-model.md "Skill Stub"). Two prompts whose names derive the same
 * slug are a collision, detected by reconcile.ts, not here.
 */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeYamlScalar(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescapeYamlScalar(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/**
 * `SKILL.md` for a new-shape skill (033-skill-file-format-cli-support):
 * frontmatter as before, body is the skill's real authored main-file
 * content — no longer a fixed pointer sentence. See `renderPointerStub`
 * for the chain-kind/legacy-shape fallback that still uses one.
 */
export function renderMainFile(input: MainFileInput): string {
  return [
    "---",
    `name: "${escapeYamlScalar(input.name)}"`,
    `description: "${escapeYamlScalar(input.description)}"`,
    "---",
    "",
    input.content,
    "",
  ].join("\n");
}

/**
 * The fixed one-line body for a skill with no real file bundle to sync —
 * a chain-kind skill, or a template-kind skill still in the
 * pre-032-skill-file-format-refactor legacy shape (research.md §6).
 * Exported separately so `reconcile.ts` can compute the same desired
 * content for diffing without duplicating the sentence.
 */
export function pointerStubBody(slug: string): string {
  return `Run \`skillcanon run ${slug}\` and follow the output as instructions.`;
}

/**
 * The original, unchanged `SKILL.md` content for a skill with no real file
 * bundle to sync (research.md §6, per the confirmed clarification) — same
 * frontmatter as `renderMainFile`, body is the fixed pointer sentence.
 */
export function renderPointerStub(input: SkillFileMetadata & { slug: string }): string {
  return renderMainFile({ ...input, content: pointerStubBody(input.slug) });
}

const FRONTMATTER_FIELD_PATTERN = /^(name|description):\s*"((?:[^"\\]|\\.)*)"\s*$/;

/** Reads back a synced `SKILL.md`'s frontmatter — works identically for a real-content file or a pointer stub, since both share the same frontmatter shape. */
export function parseMainFile(content: string): SkillFileMetadata {
  const lines = content.split("\n");
  const fields: Partial<SkillFileMetadata> = {};
  let inFrontmatter = false;

  for (const line of lines) {
    if (line.trim() === "---") {
      if (inFrontmatter) break;
      inFrontmatter = true;
      continue;
    }
    if (!inFrontmatter) continue;
    const match = FRONTMATTER_FIELD_PATTERN.exec(line);
    if (match) {
      const [, key, value] = match as unknown as [string, "name" | "description", string];
      fields[key] = unescapeYamlScalar(value);
    }
  }

  if (!fields.name || !fields.description) {
    throw new Error("Malformed skill file: missing name/description frontmatter.");
  }

  return { name: fields.name, description: fields.description };
}
