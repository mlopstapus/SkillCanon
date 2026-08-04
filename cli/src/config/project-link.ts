import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ProjectLink {
  server: string;
  projectId: string;
}

const PROJECT_LINK_RELATIVE_PATH = join(".skillcanon", "project.json");
const PROJECT_ID_PATTERN = /^\/projects\/([^/]+)\/?$/;

/**
 * The "project key" is the project's own web UI URL — no bespoke
 * server-issued token format is needed (research.md D1).
 */
export function parseProjectKey(projectKey: string): ProjectLink {
  let url: URL;
  try {
    url = new URL(projectKey);
  } catch {
    throw new Error(
      `Invalid project key: "${projectKey}" is not a URL. Copy the project key from its page in the SkillCanon web UI (a URL like https://<host>/projects/<id>).`,
    );
  }

  const match = PROJECT_ID_PATTERN.exec(url.pathname);
  if (!match) {
    throw new Error(
      `Invalid project key: "${projectKey}" does not look like a SkillCanon project URL (expected .../projects/<id>).`,
    );
  }

  return { server: url.origin, projectId: match[1] as string };
}

export function writeProjectLink(repoRoot: string, link: ProjectLink): void {
  const dir = join(repoRoot, ".skillcanon");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(repoRoot, PROJECT_LINK_RELATIVE_PATH), `${JSON.stringify(link, null, 2)}\n`, "utf8");
}

export function readProjectLink(repoRoot: string): ProjectLink {
  const path = join(repoRoot, PROJECT_LINK_RELATIVE_PATH);
  if (!existsSync(path)) {
    throw new Error("No SkillCanon project is linked in this repository. Run `skillcanon init` first.");
  }
  return JSON.parse(readFileSync(path, "utf8")) as ProjectLink;
}
