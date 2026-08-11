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
 * Pure, DOM-independent: given every relative path found in a selection,
 * returns the set of directories that directly contain a `SKILL.md` — the
 * same "any SKILL.md, its parent directory is a candidate" rule
 * `scanLocalSkillFolders()` uses. Detection is path-based only; no file
 * content is read to compute this.
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
  const paths = files.map((f) => f.relativePath);
  const candidateDirs = candidateDirectoriesForPaths(paths);
  const matched = files.filter((f) => isUnderCandidateDirectory(f.relativePath, candidateDirs));
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
