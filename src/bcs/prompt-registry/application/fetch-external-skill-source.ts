import {
  type ExternalSkillCandidate,
  type ExternalSkillSourceResult,
  ExternalSourceNotFoundError,
  MAX_EXTERNAL_SKILLS_PER_SOURCE,
  parseSkillFrontmatter,
} from "../domain/external-skill-source";
import { MAX_FILE_SIZE_BYTES, MAX_SUPPORTING_FILES } from "../domain/prompt";
import {
  fetchGithubDirectory,
  fetchGithubFile,
  parseGithubSource,
  type GithubSourceRef,
} from "../infrastructure/github-skill-source";

const MAX_DIRECTORIES_SCANNED = 50;

function byteLength(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

/**
 * Builds one skill candidate from a folder that's already known to (maybe)
 * contain a `SKILL.md`. Returns `null` when the folder turns out not to
 * qualify (no SKILL.md, or the main file violates the same size limit every
 * skill's content is held to) rather than throwing — a single bad folder in
 * a multi-skill source shouldn't fail the whole fetch (FR-004).
 */
async function buildCandidate(
  ref: GithubSourceRef,
  folderPath: string,
  fallbackName: string,
  sourceLabel: string,
): Promise<ExternalSkillCandidate | null> {
  const entries = await fetchGithubDirectory({ ...ref, path: folderPath }, sourceLabel);
  if (!entries) {
    return null;
  }
  const skillMdEntry = entries.find((e) => e.type === "file" && e.name === "SKILL.md");
  if (!skillMdEntry) {
    return null;
  }
  const mainContent = await fetchGithubFile(ref, skillMdEntry.path, sourceLabel);
  if (mainContent === null || mainContent.length === 0 || byteLength(mainContent) > MAX_FILE_SIZE_BYTES) {
    return null;
  }

  const { name, description } = parseSkillFrontmatter(mainContent, fallbackName);
  const supportingEntries = entries
    .filter((e) => e.type === "file" && e.name !== "SKILL.md")
    .slice(0, MAX_SUPPORTING_FILES);

  const supportingFiles: ExternalSkillCandidate["supportingFiles"] = [];
  for (const entry of supportingEntries) {
    const content = await fetchGithubFile(ref, entry.path, sourceLabel);
    if (content !== null && content.length > 0 && byteLength(content) <= MAX_FILE_SIZE_BYTES) {
      supportingFiles.push({ name: entry.name, content });
    }
  }

  return {
    name,
    description,
    mainFile: { name: "SKILL.md", content: mainContent },
    supportingFiles,
  };
}

/**
 * Fetches every skill found at a GitHub source (FR-001/FR-002), detecting
 * three layouts in order: a single `SKILL.md` directly at the given path;
 * a `skills/` directory of per-skill subfolders; or, failing both, every
 * top-level subdirectory of the given path that itself contains a
 * `SKILL.md`. Returns full file contents for every candidate found — the
 * caller (the New Skill drawer's Import mode) shows them for selection and
 * later hands the selected ones straight to createPrompt/publishVersion
 * with no further fetch needed.
 */
export async function fetchExternalSkillSource(source: string): Promise<ExternalSkillSourceResult> {
  const ref = parseGithubSource(source);
  const sourceLabel = `${ref.owner}/${ref.repo}${ref.path ? "/" + ref.path : ""}`;

  const rootEntries = await fetchGithubDirectory(ref, sourceLabel);
  if (rootEntries === null) {
    throw new ExternalSourceNotFoundError(sourceLabel);
  }

  const candidates: ExternalSkillCandidate[] = [];
  const hasRootSkillMd = rootEntries.some((e) => e.type === "file" && e.name === "SKILL.md");

  if (hasRootSkillMd) {
    const segments = ref.path.split("/").filter(Boolean);
    const fallbackName = segments[segments.length - 1] ?? ref.repo;
    const candidate = await buildCandidate(ref, ref.path, fallbackName, sourceLabel);
    if (candidate) {
      candidates.push(candidate);
    }
  } else {
    const skillsDir = rootEntries.find((e) => e.type === "dir" && e.name === "skills");
    const scanEntries = skillsDir
      ? await fetchGithubDirectory({ ...ref, path: skillsDir.path }, sourceLabel)
      : rootEntries;

    const subdirs = (scanEntries ?? []).filter((e) => e.type === "dir").slice(0, MAX_DIRECTORIES_SCANNED);
    for (const dir of subdirs) {
      if (candidates.length >= MAX_EXTERNAL_SKILLS_PER_SOURCE) {
        break;
      }
      const candidate = await buildCandidate(ref, dir.path, dir.name, sourceLabel);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0) {
    throw new ExternalSourceNotFoundError(sourceLabel);
  }

  return { source: sourceLabel, skills: candidates };
}
