/**
 * 013-skill-import-and-external-registries/002, spec
 * 037-local-folder-skill-upload. Client-side folder selection glue —
 * intentionally NOT imported by anything other than this drawer's client
 * component, and imports no runtime value from `@/bcs/prompt-registry`
 * (only the `LocalSkillFileEntry` *type*, which is erased at compile time)
 * to avoid dragging the bounded context's server-only dependency graph into
 * the client bundle (a documented, previously-hit gotcha in this repo).
 */

import type { LocalSkillFileEntry } from "@/bcs/prompt-registry";

/**
 * Directory names that can never contain an author-written skill —
 * dependency/build/VCS output. Walking into these is the dominant cost when
 * a user selects a large ancestor folder (e.g. a whole repo checkout) to
 * sweep in a skills folder the OS picker hides (dotfolders like `.claude`
 * aren't shown by default in native folder-picker dialogs). Excluded at
 * *walk* time (before descending), not just filtered from the result, so
 * the walk itself stays fast rather than merely discarding content after
 * reading it.
 */
const SKIPPED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "vendor",
  ".pnpm-store",
  ".nuxt",
  ".svelte-kit",
  ".output",
]);

/** True when any *directory* segment of `relativePath` (not the filename) is in the skip-list. */
export function hasSkippedSegment(relativePath: string): boolean {
  const segments = relativePath.split("/");
  segments.pop(); // drop the filename — only directory segments are checked
  return segments.some((segment) => SKIPPED_DIRECTORY_NAMES.has(segment));
}

/**
 * Pure, DOM-independent: given every relative path found in a selection,
 * returns the set of directories that directly contain a `SKILL.md` — the
 * same "any SKILL.md, its parent directory is a candidate" rule
 * `scanLocalSkillFolders()` uses. Detection is path-based only; no file
 * content is read to compute this. Callers are expected to have already
 * filtered out skip-listed noise directories (see `hasSkippedSegment`) —
 * this function's own contract is unchanged and exclusion-free.
 */
export function candidateDirectoriesForPaths(paths: string[]): Set<string> {
  const dirs = new Set<string>();
  for (const path of paths) {
    const lastSlash = path.lastIndexOf("/");
    const base = lastSlash === -1 ? path : path.slice(lastSlash + 1);
    if (base === "SKILL.md") {
      dirs.add(lastSlash === -1 ? "" : path.slice(0, lastSlash));
    }
  }
  return dirs;
}

function isUnderCandidateDirectory(path: string, candidateDirs: Set<string>): boolean {
  const lastSlash = path.lastIndexOf("/");
  const dir = lastSlash === -1 ? "" : path.slice(0, lastSlash);
  return candidateDirs.has(dir);
}

/** Reads only the files that fall under an already-detected candidate directory — implements FR-012. */
async function readMatchedFiles(files: Array<{ relativePath: string; file: File }>): Promise<LocalSkillFileEntry[]> {
  const noiseFiltered = files.filter((f) => !hasSkippedSegment(f.relativePath));
  const paths = noiseFiltered.map((f) => f.relativePath);
  const candidateDirs = candidateDirectoriesForPaths(paths);
  const matched = noiseFiltered.filter((f) => isUnderCandidateDirectory(f.relativePath, candidateDirs));
  return Promise.all(
    matched.map(async (f) => ({ relativePath: f.relativePath, content: await f.file.text() })),
  );
}

/** True when this browser supports selecting a whole folder via the file picker (FR-015). */
export function supportsFolderSelection(): boolean {
  if (typeof document === "undefined") return false;
  const input = document.createElement("input");
  return "webkitdirectory" in input;
}

/** Reads a `webkitdirectory` `<input>`'s selection, filtered to candidate-directory files only. */
export async function readLocalSkillFolderEntriesFromFileList(fileList: FileList): Promise<LocalSkillFileEntry[]> {
  const files = Array.from(fileList)
    .filter((file) => file.webkitRelativePath)
    .map((file) => ({ relativePath: file.webkitRelativePath, file }));
  return readMatchedFiles(files);
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  name: string;
  file?(callback: (file: File) => void): void;
  createReader?(): { readEntries(callback: (entries: FileSystemEntryLike[]) => void): void };
}

function readAllEntries(reader: { readEntries(callback: (entries: FileSystemEntryLike[]) => void): void }): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve) => reader.readEntries((entries) => resolve(entries)));
}

async function walkEntry(
  entry: FileSystemEntryLike,
  out: Array<{ relativePath: string; file: File }>,
): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve) => entry.file!((f) => resolve(f)));
    // fullPath is absolute-from-drop-root with a leading slash (e.g. "/skill/SKILL.md").
    out.push({ relativePath: entry.fullPath.replace(/^\/+/, ""), file });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) return; // don't even list this directory's contents
    const reader = entry.createReader();
    let entries = await readAllEntries(reader);
    // readEntries() may return results in batches; keep calling until empty.
    while (entries.length > 0) {
      await Promise.all(entries.map((child) => walkEntry(child, out)));
      entries = await readAllEntries(reader);
    }
  }
}

/** Reads a drag-and-drop folder selection, filtered to candidate-directory files only. */
export async function readLocalSkillFolderEntriesFromDataTransfer(
  items: DataTransferItemList,
): Promise<LocalSkillFileEntry[]> {
  const files: Array<{ relativePath: string; file: File }> = [];
  const topLevelEntries: FileSystemEntryLike[] = [];
  for (const item of Array.from(items)) {
    const getAsEntry = (item as unknown as { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry;
    const entry = getAsEntry?.call(item);
    if (entry) topLevelEntries.push(entry);
  }
  await Promise.all(topLevelEntries.map((entry) => walkEntry(entry, files)));
  return readMatchedFiles(files);
}

/**
 * `showDirectoryPicker()`/`FileSystemDirectoryHandle.values()` (File System
 * Access API) aren't in the installed TypeScript's `lib.dom.d.ts` even
 * though `FileSystemDirectoryHandle`/`FileSystemFileHandle.getFile()`
 * already are — narrow, local augmentation, matching this repo's established
 * pattern for browser-API typing gaps (see `webkitdirectory` on
 * `InputHTMLAttributes` elsewhere in this drawer).
 */
declare global {
  interface Window {
    showDirectoryPicker?(options?: { id?: string; mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemDirectoryHandle {
    values?(): AsyncIterableIterator<FileSystemHandle>;
  }
}

/**
 * True when this browser supports the lazy, top-down File System Access API
 * directory picker (Chromium-family only as of this writing) — the fast path
 * that can skip descending into noise directories entirely, unlike
 * `<input webkitdirectory>`, which forces a full native recursive
 * enumeration before any of this module's code ever runs.
 */
export function supportsFileSystemAccessDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

async function walkDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  path: string,
  out: Array<{ relativePath: string; file: File }>,
): Promise<void> {
  if (!handle.values) return;
  for await (const child of handle.values()) {
    const childPath = path ? `${path}/${child.name}` : child.name;
    if (child.kind === "directory") {
      if (SKIPPED_DIRECTORY_NAMES.has(child.name)) continue; // don't even list this directory's contents
      await walkDirectoryHandle(child as FileSystemDirectoryHandle, childPath, out);
    } else {
      const file = await (child as FileSystemFileHandle).getFile();
      out.push({ relativePath: childPath, file });
    }
  }
}

/**
 * Reads a File System Access API directory selection, filtered to
 * candidate-directory files only. Unlike the `<input webkitdirectory>`/
 * drag-and-drop paths, this walk is lazy and top-down — a skip-listed
 * directory is never listed at all, not just filtered out afterward.
 */
export async function readLocalSkillFolderEntriesFromDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<LocalSkillFileEntry[]> {
  const files: Array<{ relativePath: string; file: File }> = [];
  await walkDirectoryHandle(handle, "", files);
  return readMatchedFiles(files);
}
