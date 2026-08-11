/**
 * GitHub-backed external skill source fetching (013-skill-import-and-
 * external-registries, spec 036-external-skill-import). Talks to
 * `api.github.com`'s Contents API directly — no SDK dependency needed for
 * this narrow a surface (list a directory, read a file).
 */

import { getGithubToken } from "@/shared/config";
import { ExternalSourceUnreachableError, InvalidExternalSourceError } from "../domain/external-skill-source";

export interface GithubSourceRef {
  owner: string;
  repo: string;
  /** Path within the repo to start scanning from ("" means repo root). */
  path: string;
  ref?: string;
}

export interface GithubContentEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

/**
 * Accepts a full GitHub URL (`https://github.com/owner/repo`, optionally
 * with `/tree/<branch>/<path>`), a bare `github.com/owner/repo[...]`, or the
 * `owner/repo[/path]` shorthand (FR-001). Never a different host — GitHub
 * repositories are the only source type this feature supports (FR-013).
 */
export function parseGithubSource(source: string): GithubSourceRef {
  let trimmed = source.trim().replace(/^https?:\/\//, "");
  if (trimmed.startsWith("github.com/")) {
    trimmed = trimmed.slice("github.com/".length);
  } else if (trimmed.includes("://") || trimmed.includes(".com") || trimmed.includes(".org")) {
    // Some other host was given explicitly — out of scope for v1.
    throw new InvalidExternalSourceError(
      `"${source}" doesn't look like a GitHub repository. Only GitHub sources are supported (owner/repo, or a github.com URL).`,
    );
  }
  trimmed = trimmed.replace(/\/+$/, "").replace(/\.git$/, "");
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new InvalidExternalSourceError(
      `"${source}" is not a valid GitHub source. Expected "owner/repo" or a github.com repository URL.`,
    );
  }
  const [owner, repo, ...rest] = segments;
  if (!owner || !repo) {
    throw new InvalidExternalSourceError(`"${source}" is not a valid GitHub source.`);
  }

  // `owner/repo/tree/<branch>/<path...>` — GitHub's own web URL shape for a
  // non-default branch/subpath.
  if (rest[0] === "tree" && rest.length > 1) {
    const ref = rest[1];
    const path = rest.slice(2).join("/");
    return { owner, repo, path, ref };
  }
  return { owner, repo, path: rest.join("/") };
}

/** Encodes each `/`-separated segment of a repo-relative path individually, preserving the separators GitHub's Contents API expects. */
function encodeRepoPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function githubHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SkillCanon-skill-import",
  };
  const token = getGithubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function githubGet(url: string, sourceLabel: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: githubHeaders() });
  } catch (err) {
    throw new ExternalSourceUnreachableError(
      sourceLabel,
      err instanceof Error ? err.message : "network request failed",
    );
  }
  if (response.status === 404) {
    return null;
  }
  if (response.status === 403 || response.status === 429) {
    throw new ExternalSourceUnreachableError(
      sourceLabel,
      "GitHub API rate limit exceeded. Set GITHUB_TOKEN to raise the limit, or try again later.",
    );
  }
  if (!response.ok) {
    throw new ExternalSourceUnreachableError(sourceLabel, `GitHub returned ${response.status}.`);
  }
  return response.json();
}

/** Lists a directory's entries. Returns `null` for a nonexistent path (distinguishing "empty" from "not found" is the caller's job). */
export async function fetchGithubDirectory(
  ref: GithubSourceRef,
  sourceLabel: string,
): Promise<GithubContentEntry[] | null> {
  const query = ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : "";
  const url = `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/contents/${encodeRepoPath(ref.path)}${query}`;
  const json = await githubGet(url, sourceLabel);
  if (json === null) {
    return null;
  }
  if (!Array.isArray(json)) {
    // Contents API returns a single object (not an array) when the path is a file, not a directory.
    return null;
  }
  return json.map((entry) => ({
    name: String((entry as { name: unknown }).name),
    path: String((entry as { path: unknown }).path),
    type: (entry as { type: unknown }).type === "dir" ? "dir" : "file",
  }));
}

/** Reads one file's text content. Returns `null` for a nonexistent path. */
export async function fetchGithubFile(
  ref: GithubSourceRef,
  filePath: string,
  sourceLabel: string,
): Promise<string | null> {
  const query = ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : "";
  const url = `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/contents/${encodeRepoPath(filePath)}${query}`;
  const json = await githubGet(url, sourceLabel);
  if (json === null || Array.isArray(json)) {
    return null;
  }
  const body = json as { content?: unknown; encoding?: unknown };
  if (typeof body.content !== "string") {
    return null;
  }
  if (body.encoding === "base64") {
    return Buffer.from(body.content, "base64").toString("utf8");
  }
  return body.content;
}
