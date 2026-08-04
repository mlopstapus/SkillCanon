export interface StubMetadata {
  name: string;
  description: string;
}

export interface StubInput extends StubMetadata {
  slug: string;
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
 * The body is a fixed one-line instruction, identical across every stub
 * (research.md D4) — only the frontmatter varies per prompt.
 */
export function renderStub(input: StubInput): string {
  return [
    "---",
    `name: "${escapeYamlScalar(input.name)}"`,
    `description: "${escapeYamlScalar(input.description)}"`,
    "---",
    "",
    `Run \`skillcanon run ${input.slug}\` and follow the output as instructions.`,
    "",
  ].join("\n");
}

const FRONTMATTER_FIELD_PATTERN = /^(name|description):\s*"((?:[^"\\]|\\.)*)"\s*$/;

export function parseStub(content: string): StubMetadata {
  const lines = content.split("\n");
  const fields: Partial<StubMetadata> = {};
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
    throw new Error("Malformed skill stub: missing name/description frontmatter.");
  }

  return { name: fields.name, description: fields.description };
}
