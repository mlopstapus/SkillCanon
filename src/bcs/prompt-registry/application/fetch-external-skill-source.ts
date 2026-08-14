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
  type GithubContentEntry,
  type GithubSourceRef,
} from "../infrastructure/github-skill-source";

const MAX_DIRECTORIES_SCANNED = 50;

function byteLength(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

/**
 * Builds one skill candidate from a folder's already-fetched directory
 * listing. Returns `null` when the folder turns out not to qualify (no
 * SKILL.md, or the main file violates the same size limit every skill's
 * content is held to) rather than throwing — a single bad folder in a
 * multi-skill source shouldn't fail the whole fetch (FR-004).
 */
async function buildCandidateFromEntries(
  ref: GithubSourceRef,
  entries: GithubContentEntry[],
  fallbackName: string,
  sourceLabel: string,
): Promise<ExternalSkillCandidate | null> {
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

/** Fetches a folder's directory listing, then delegates to {@link buildCandidateFromEntries}. */
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
  return buildCandidateFromEntries(ref, entries, fallbackName, sourceLabel);
}

/**
 * Looks for a directory literally named "skills" — either as an immediate
 * child of the given root (the original FR-004 shape), or nested one level
 * under a ".claude" directory. `.claude/skills/<name>/SKILL.md` is the
 * standard Claude Code skills location (and the same convention this
 * product's own `skillcanon sync` CLI command writes into locally), so a
 * source using it should be discovered without the caller needing to supply
 * the subpath manually. Returns the resolved directory's repo path, or
 * `null` if neither shape is present.
 */
async function resolveSkillsDirectory(
  ref: GithubSourceRef,
  rootEntries: GithubContentEntry[],
  sourceLabel: string,
): Promise<string | null> {
  const rootSkillsDir = rootEntries.find((e) => e.type === "dir" && e.name === "skills");
  if (rootSkillsDir) {
    return rootSkillsDir.path;
  }
  const claudeDir = rootEntries.find((e) => e.type === "dir" && e.name === ".claude");
  if (!claudeDir) {
    return null;
  }
  const claudeEntries = await fetchGithubDirectory({ ...ref, path: claudeDir.path }, sourceLabel);
  const claudeSkillsDir = claudeEntries?.find((e) => e.type === "dir" && e.name === "skills");
  return claudeSkillsDir?.path ?? null;
}

/**
 * Scans a set of directories for skill folders. A directory that directly
 * contains a SKILL.md becomes a candidate. A directory that doesn't, but
 * has subdirectories of its own, is treated as a category folder (this
 * repo's own `universal/`/`configurable/`/`components/` layout) and — only
 * when `allowNesting` is set — its immediate children are checked too, one
 * level deeper, with nesting disabled for that inner call so the scan never
 * goes more than two levels below the original root. Bounded by `scanned`
 * (total directory fetches, capped at MAX_DIRECTORIES_SCANNED) and
 * `candidates.length` (capped at MAX_EXTERNAL_SKILLS_PER_SOURCE), mutated
 * in place across the whole recursive scan.
 */
async function scanForCandidates(
  ref: GithubSourceRef,
  dirs: GithubContentEntry[],
  sourceLabel: string,
  candidates: ExternalSkillCandidate[],
  scanned: { count: number },
  allowNesting: boolean,
): Promise<void> {
  for (const dir of dirs) {
    if (candidates.length >= MAX_EXTERNAL_SKILLS_PER_SOURCE || scanned.count >= MAX_DIRECTORIES_SCANNED) {
      return;
    }
    scanned.count += 1;
    const entries = await fetchGithubDirectory({ ...ref, path: dir.path }, sourceLabel);
    if (!entries) {
      continue;
    }
    const candidate = await buildCandidateFromEntries(ref, entries, dir.name, sourceLabel);
    if (candidate) {
      candidates.push(candidate);
      continue;
    }
    if (allowNesting) {
      const subdirs = entries.filter((e) => e.type === "dir");
      await scanForCandidates(ref, subdirs, sourceLabel, candidates, scanned, false);
    }
  }
}

/**
 * Fetches every skill found at a GitHub source (FR-001/FR-002), detecting
 * layouts in order: a single `SKILL.md` directly at the given path; a
 * `skills/` (or nested `.claude/skills/`) directory of per-skill
 * subfolders; or, failing both, every top-level subdirectory of the given
 * path that itself contains a `SKILL.md`, additionally recursing one level
 * into a subdirectory that doesn't (a category folder, e.g. this repo's own
 * `universal/`/`configurable/`/`components/` layout). Returns full file
 * contents for every candidate found — the caller (the New Skill drawer's
 * Import mode) shows them for selection and later hands the selected ones
 * straight to createPrompt/publishVersion with no further fetch needed.
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
    const skillsDirPath = await resolveSkillsDirectory(ref, rootEntries, sourceLabel);
    const scanEntries = skillsDirPath
      ? await fetchGithubDirectory({ ...ref, path: skillsDirPath }, sourceLabel)
      : rootEntries;

    const subdirs = (scanEntries ?? []).filter((e) => e.type === "dir").slice(0, MAX_DIRECTORIES_SCANNED);
    const scanned = { count: 0 };
    // A resolved skills/ (or .claude/skills/) directory's own children are
    // expected to each be a skill folder directly. Falling back to a bare
    // scan of the given root (no skills directory found at all) additionally
    // allows one more level of nesting for a category-folder layout.
    await scanForCandidates(ref, subdirs, sourceLabel, candidates, scanned, /* allowNesting */ !skillsDirPath);
  }

  if (candidates.length === 0) {
    throw new ExternalSourceNotFoundError(sourceLabel);
  }

  return { source: sourceLabel, skills: candidates };
}
