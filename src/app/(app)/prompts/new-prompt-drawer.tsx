"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Drawer } from "@/shared/ui";
import type { ExternalSkillCandidate, LocalSkillCandidate, LocalSkillFileEntry } from "@/bcs/prompt-registry";
import type {
  FetchExternalSkillSourceResult,
  ImportExternalSkillsActionResult,
  ImportLocalSkillsActionResult,
  PromptActionResult,
  ScanLocalSkillFoldersActionResult,
} from "./actions";
import {
  readLocalSkillFolderEntriesFromDataTransfer,
  readLocalSkillFolderEntriesFromDirectoryHandle,
  readLocalSkillFolderEntriesFromFileList,
  supportsFileSystemAccessDirectoryPicker,
  supportsFolderSelection,
} from "./local-folder-reader";

// `webkitdirectory` is a real, widely-supported (if non-standard) HTML
// attribute React's own DOM typings don't include.
declare module "react" {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
  }
}

export interface NewPromptValues {
  name: string;
  description?: string;
  tags?: string[];
}

export interface NewPromptDrawerProps {
  onClose: () => void;
  onSubmit: (values: NewPromptValues) => Promise<PromptActionResult>;
  /** Every skill name already in this org, org-wide (not just the current filtered list) — used for import collision checks. */
  existingNames: string[];
  onFetchImportSource: (source: string) => Promise<FetchExternalSkillSourceResult>;
  onImportSkills: (source: string, skills: ExternalSkillCandidate[]) => Promise<ImportExternalSkillsActionResult>;
  onScanLocalFolder: (entries: LocalSkillFileEntry[]) => Promise<ScanLocalSkillFoldersActionResult>;
  onImportLocalSkills: (skills: LocalSkillCandidate[]) => Promise<ImportLocalSkillsActionResult>;
  /** Called after at least one skill imports successfully, so the caller can refresh the list. */
  onImported: () => void;
}

type NewSkillMode = "blank" | "import" | "upload";

/**
 * Collects only name/description/tags (032-skill-file-format-refactor,
 * FR-018) — the skill's first version content (main file plus any
 * supporting files) is authored through the same New Version file-bundle
 * flow used for every later version, not a separate template-entry form
 * here. `onSubmit` is expected to create the skill shell and then hand off
 * to that flow (e.g. by navigating to the new skill's detail page).
 *
 * The Import mode (013-skill-import-and-external-registries/001) fetches an
 * external GitHub source. The Upload mode (013-skill-import-and-external-
 * registries/002, spec 037-local-folder-skill-upload) reads a *local*
 * folder instead — a fully separate code path (no source-URL/provenance
 * concept, no fixed batch-size cap), but sharing the same detect → preview/
 * select → confirm shape and visual language as the Import mode.
 *
 * Unlike Import mode's confirm button (disabled by ANY selected candidate
 * colliding with an existing org skill), Upload mode's confirm button stays
 * enabled through such a collision — the per-skill server-side isolation
 * (037's User Story 3) needs to be reachable through normal confirm, not
 * blocked by a client-side pre-check.
 */
export function NewPromptDrawer({
  onClose,
  onSubmit,
  existingNames,
  onFetchImportSource,
  onImportSkills,
  onScanLocalFolder,
  onImportLocalSkills,
  onImported,
}: NewPromptDrawerProps) {
  const titleId = useId();
  const [mode, setMode] = useState<NewSkillMode>("blank");

  // Blank-skill form state.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [blankError, setBlankError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Import-from-link state.
  const [source, setSource] = useState("");
  const [fetchState, setFetchState] = useState<"idle" | "fetching" | "fetched">("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [results, setResults] = useState<ExternalSkillCandidate[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [isImporting, startImportTransition] = useTransition();
  const [importFailures, setImportFailures] = useState<Array<{ name: string; error: string }>>([]);

  // Import-from-folder (upload) state.
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderSupported, setFolderSupported] = useState(true);
  const [isDragActive, setIsDragActive] = useState(false);
  const [localScanState, setLocalScanState] = useState<"idle" | "reading" | "scanning" | "scanned">("idle");
  const [localScanError, setLocalScanError] = useState<string | null>(null);
  const [localCandidates, setLocalCandidates] = useState<LocalSkillCandidate[]>([]);
  const [localDuplicateNames, setLocalDuplicateNames] = useState<string[]>([]);
  const [localInvalidFolders, setLocalInvalidFolders] = useState<Array<{ folderPath: string; reason: string }>>([]);
  const [localChecked, setLocalChecked] = useState<Set<number>>(new Set());
  const [isUploading, startUploadTransition] = useTransition();
  const [localImportFailures, setLocalImportFailures] = useState<Array<{ name: string; error: string }>>([]);

  useEffect(() => {
    // One-time feature-detection sync from the browser (FR-015), not a subscribable event source.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setFolderSupported(supportsFolderSelection());
  }, []);

  const existingNameSet = new Set(existingNames);
  const localDuplicateNameSet = new Set(localDuplicateNames);

  function submitBlank() {
    setBlankError(null);
    startTransition(async () => {
      const result = await onSubmit({
        name,
        description: description || undefined,
        tags: tags
          ? tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
      });
      if (!result.ok) {
        setBlankError(result.error);
      }
    });
  }

  function fetchSource() {
    if (!source.trim()) return;
    setFetchState("fetching");
    setFetchError(null);
    setImportFailures([]);
    startTransition(async () => {
      const result = await onFetchImportSource(source.trim());
      if (result.ok) {
        setResults(result.skills);
        setChecked(new Set(result.skills.map((_, i) => i)));
        setFetchState("fetched");
      } else {
        setFetchError(result.error);
        setResults([]);
        setFetchState("idle");
      }
    });
  }

  function toggleChecked(index: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const selectedSkills = results.filter((_, i) => checked.has(i));
  const collidingNames = selectedSkills.filter((s) => existingNameSet.has(s.name)).map((s) => s.name);
  const importDisabled = selectedSkills.length === 0 || collidingNames.length > 0 || isImporting;

  function runImport() {
    if (importDisabled) return;
    startImportTransition(async () => {
      const result = await onImportSkills(source.trim(), selectedSkills);
      if (!result.ok) {
        setFetchError(result.error);
        return;
      }
      if (result.failed.length > 0) {
        setImportFailures(result.failed);
        // Keep only the still-unresolved candidates selectable; drop the ones that succeeded.
        setResults((prev) => prev.filter((s) => result.failed.some((f) => f.name === s.name)));
        setChecked(new Set());
      }
      if (result.imported.length > 0) {
        onImported();
      }
      if (result.failed.length === 0) {
        onClose();
      }
    });
  }

  async function scanLocalEntries(entries: LocalSkillFileEntry[]) {
    setLocalScanState("scanning");
    setLocalScanError(null);
    setLocalImportFailures([]);
    const result = await onScanLocalFolder(entries);
    if (!result.ok) {
      setLocalScanError(result.error);
      setLocalCandidates([]);
      setLocalInvalidFolders([]);
      setLocalDuplicateNames([]);
      setLocalChecked(new Set());
      setLocalScanState("idle");
      return;
    }
    const seenNames = new Set<string>();
    const duplicateSet = new Set(result.duplicateNames);
    const defaultChecked = new Set<number>();
    result.candidates.forEach((candidate, i) => {
      // Default all candidates checked, except only the first of any set of
      // intra-batch duplicate names — keeps "at most one selected per
      // conflicting name" true from the very first render (FR-013).
      if (duplicateSet.has(candidate.name)) {
        if (seenNames.has(candidate.name)) return;
        seenNames.add(candidate.name);
      }
      defaultChecked.add(i);
    });
    setLocalCandidates(result.candidates);
    setLocalDuplicateNames(result.duplicateNames);
    setLocalInvalidFolders(result.invalidFolders);
    setLocalChecked(defaultChecked);
    setLocalScanState("scanned");
  }

  async function handleFolderInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    e.target.value = "";
    if (!fileList || fileList.length === 0) return;
    setLocalScanState("reading");
    const entries = await readLocalSkillFolderEntriesFromFileList(fileList);
    await scanLocalEntries(entries);
  }

  async function handleFolderDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragActive(false);
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;
    setLocalScanState("reading");
    const entries = await readLocalSkillFolderEntriesFromDataTransfer(items);
    await scanLocalEntries(entries);
  }

  async function handleBrowseForFolder() {
    if (!supportsFileSystemAccessDirectoryPicker()) {
      folderInputRef.current?.click();
      return;
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker!();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // user cancelled — not an error
      throw err;
    }
    setLocalScanState("reading");
    const entries = await readLocalSkillFolderEntriesFromDirectoryHandle(handle);
    await scanLocalEntries(entries);
  }

  function toggleLocalChecked(index: number) {
    const candidate = localCandidates[index];
    if (!candidate) return;
    setLocalChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        return next;
      }
      if (localDuplicateNameSet.has(candidate.name)) {
        // Enforce "at most one selected per conflicting name" (FR-013).
        for (const otherIndex of next) {
          if (localCandidates[otherIndex]?.name === candidate.name) {
            next.delete(otherIndex);
          }
        }
      }
      next.add(index);
      return next;
    });
  }

  const selectedLocalSkills = localCandidates.filter((_, i) => localChecked.has(i));
  // Deliberately no `collidingNames.length > 0` disable here — see the
  // component doc comment above and contracts/server-actions.md.
  const localImportDisabled = selectedLocalSkills.length === 0 || isUploading;

  function runLocalImport() {
    if (localImportDisabled) return;
    startUploadTransition(async () => {
      const result = await onImportLocalSkills(selectedLocalSkills);
      if (!result.ok) {
        setLocalScanError(result.error);
        return;
      }
      if (result.failed.length > 0) {
        setLocalImportFailures(result.failed);
        const stillPresent = new Set(result.failed.map((f) => f.name));
        setLocalCandidates((prev) => prev.filter((s) => stillPresent.has(s.name)));
        // Drop any duplicate-name flag whose conflicting candidates aren't
        // both still present after filtering — a name that failed alone
        // (its former conflicting sibling either succeeded or was never
        // selected) is no longer a live intra-batch conflict.
        setLocalDuplicateNames((prev) => prev.filter((name) => stillPresent.has(name)));
        setLocalChecked(new Set());
      }
      if (result.imported.length > 0) {
        onImported();
      }
      if (result.failed.length === 0) {
        onClose();
      }
    });
  }

  return (
    <Drawer onClose={onClose} labelledBy={titleId} widthClassName="w-[480px]">
      <div className="flex h-14 items-center justify-between border-b border-border px-5">
        <span id={titleId} className="font-display text-[15px] font-semibold">
          New skill
        </span>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7.5 place-items-center rounded-control border border-border text-dim"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="mx-5.5 mt-4 flex gap-0.5 rounded-control border border-border-2 bg-surface p-0.5">
        <button
          type="button"
          onClick={() => setMode("blank")}
          className={`flex-1 rounded-[7px] py-2 text-[12.5px] font-semibold ${
            mode === "blank" ? "bg-panel text-text" : "text-faint"
          }`}
        >
          Blank skill
        </button>
        <button
          type="button"
          onClick={() => setMode("import")}
          className={`flex-1 rounded-[7px] py-2 text-[12.5px] font-semibold ${
            mode === "import" ? "bg-panel text-text" : "text-faint"
          }`}
        >
          Import from link
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`flex-1 rounded-[7px] py-2 text-[12.5px] font-semibold ${
            mode === "upload" ? "bg-panel text-text" : "text-faint"
          }`}
        >
          Import from folder
        </button>
      </div>

      {mode === "blank" ? (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5.5 py-5">
          {blankError ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">{blankError}</div>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="release-notes-gen"
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-a"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this skill does…"
              className="resize-y rounded-control border border-border-2 bg-surface px-3 py-2.5 text-[13px] text-text outline-none focus:border-a"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-dim">Tags</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="git, conventional"
              className="rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[12.5px] text-text outline-none focus:border-a"
            />
          </label>
          <div className="rounded-card border border-a/25 bg-a-soft p-3 text-[11.5px] leading-relaxed text-dim">
            After creating the skill, you&apos;ll author its first version&apos;s instructions (main file plus
            any supporting files) on its detail page.
          </div>
        </div>
      ) : mode === "import" ? (
        <div className="flex flex-1 flex-col gap-4.5 overflow-y-auto px-5.5 py-5">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-dim">Source</label>
            <input
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setFetchState("idle");
                setResults([]);
                setImportFailures([]);
              }}
              placeholder="github.com/anthropics/skills or owner/repo"
              className="w-full rounded-control border border-border-2 bg-surface px-3 py-2.5 font-mono text-[13px] text-text outline-none focus:border-a"
            />
          </div>

          <button
            type="button"
            onClick={fetchSource}
            disabled={!source.trim() || fetchState === "fetching"}
            className="flex items-center justify-center gap-2 rounded-control border border-border-2 bg-surface py-2.5 text-[13px] font-semibold text-text disabled:opacity-50"
          >
            {fetchState === "fetching" ? "Fetching…" : fetchState === "fetched" ? "Re-fetch" : "Fetch skills"}
          </button>

          {fetchError ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">{fetchError}</div>
          ) : null}

          {importFailures.length > 0 ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[11.5px] leading-relaxed text-red">
              {importFailures.map((f) => (
                <div key={f.name}>
                  <span className="font-semibold">{f.name}</span>: {f.error}
                </div>
              ))}
            </div>
          ) : null}

          {fetchState === "fetched" && results.length > 0 ? (
            <div>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase">
                  Found {results.length} skill{results.length === 1 ? "" : "s"}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-2">
                {results.map((r, i) => {
                  const isChecked = checked.has(i);
                  const collides = existingNameSet.has(r.name);
                  return (
                    <div
                      key={r.name + i}
                      role="checkbox"
                      aria-checked={isChecked}
                      tabIndex={0}
                      onClick={() => toggleChecked(i)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleChecked(i);
                        }
                      }}
                      className={`flex cursor-pointer items-start gap-3 rounded-card border p-3.5 transition-colors ${
                        collides
                          ? "border-red/40"
                          : isChecked
                            ? "border-a/40 bg-a-soft"
                            : "border-border bg-surface"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border-[1.5px] ${
                          isChecked ? "border-a bg-a" : "border-border-2 bg-transparent"
                        }`}
                      >
                        {isChecked ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--afg)" strokeWidth="3">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[13px] font-semibold text-text">{r.name}</div>
                        <div className="mt-1 text-[12px] leading-relaxed text-dim">{r.description}</div>
                        <div className="mt-2 flex gap-1.5">
                          <span className="rounded-[5px] border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-faint">
                            {r.mainFile.name}
                          </span>
                          {r.supportingFiles.map((f) => (
                            <span
                              key={f.name}
                              className="rounded-[5px] border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-faint"
                            >
                              {f.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {collidingNames.length > 0 ? (
                <div className="mt-2.5 flex gap-2 rounded-card border border-red/30 bg-red-soft p-3 text-[11.5px] leading-relaxed text-red">
                  &quot;{collidingNames.join('", "')}&quot; already exists in this org — rename or deselect before
                  importing.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4.5 overflow-y-auto px-5.5 py-5">
          {!folderSupported ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">
              Folder selection isn&apos;t available in this browser. Try a recent version of Chrome, Firefox,
              Safari, or Edge.
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={handleFolderDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-6 text-center transition-colors ${
                isDragActive ? "border-a bg-a-soft" : "border-border-2 bg-surface"
              }`}
            >
              <span className="text-[12.5px] font-semibold text-text">Drag a folder here, or</span>
              <button
                type="button"
                onClick={handleBrowseForFolder}
                className="rounded-control border border-border-2 bg-panel px-3.5 py-2 text-[12.5px] font-semibold text-text"
              >
                Choose folder
              </button>
              <span className="text-[11px] text-faint">
                Scans for SKILL.md files inside — nothing else is read or sent. Large directories like{" "}
                <code>node_modules</code> are skipped automatically.
              </span>
              <span className="text-[11px] text-faint">
                Don&apos;t see <code>.claude</code> or <code>.agents</code>? Press Cmd+Shift+. (Mac) to reveal
                hidden folders, or just choose the parent folder.
              </span>
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                multiple
                className="hidden"
                onChange={handleFolderInputChange}
              />
            </div>
          )}

          {localScanState === "reading" ? <div className="text-[12px] text-dim">Reading folder…</div> : null}
          {localScanState === "scanning" ? <div className="text-[12px] text-dim">Scanning…</div> : null}

          {localScanError ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[12px] text-red">{localScanError}</div>
          ) : null}

          {localImportFailures.length > 0 ? (
            <div className="rounded-card border border-red/30 bg-red-soft p-3 text-[11.5px] leading-relaxed text-red">
              {localImportFailures.map((f) => (
                <div key={f.name}>
                  <span className="font-semibold">{f.name}</span>: {f.error}
                </div>
              ))}
            </div>
          ) : null}

          {localScanState === "scanned" && localCandidates.length === 0 && localInvalidFolders.length === 0 ? (
            <div className="rounded-card border border-border bg-surface p-3 text-[12px] text-dim">
              No skills found in the selected folder.
            </div>
          ) : null}

          {localScanState === "scanned" && (localCandidates.length > 0 || localInvalidFolders.length > 0) ? (
            <div>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase">
                  Found {localCandidates.length} skill{localCandidates.length === 1 ? "" : "s"}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-2">
                {localCandidates.map((c, i) => {
                  const isChecked = localChecked.has(i);
                  const isDuplicate = localDuplicateNameSet.has(c.name);
                  const collidesExisting = existingNameSet.has(c.name);
                  return (
                    <div
                      key={c.folderPath + i}
                      role="checkbox"
                      aria-checked={isChecked}
                      tabIndex={0}
                      onClick={() => toggleLocalChecked(i)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleLocalChecked(i);
                        }
                      }}
                      className={`flex cursor-pointer items-start gap-3 rounded-card border p-3.5 transition-colors ${
                        isDuplicate || collidesExisting
                          ? "border-red/40"
                          : isChecked
                            ? "border-a/40 bg-a-soft"
                            : "border-border bg-surface"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border-[1.5px] ${
                          isChecked ? "border-a bg-a" : "border-border-2 bg-transparent"
                        }`}
                      >
                        {isChecked ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--afg)" strokeWidth="3">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[13px] font-semibold text-text">{c.name}</div>
                        <div className="mt-0.5 font-mono text-[10.5px] text-faint">{c.folderPath || "/"}</div>
                        <div className="mt-1 text-[12px] leading-relaxed text-dim">{c.description}</div>
                        <div className="mt-2 flex gap-1.5">
                          <span className="rounded-[5px] border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-faint">
                            {c.mainFile.name}
                          </span>
                          {c.supportingFiles.map((f) => (
                            <span
                              key={f.name}
                              className="rounded-[5px] border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-faint"
                            >
                              {f.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {localInvalidFolders.length > 0 ? (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {localInvalidFolders.map((inv) => (
                    <div
                      key={inv.folderPath}
                      className="rounded-card border border-border bg-surface p-3 text-[11.5px] leading-relaxed text-faint opacity-70"
                    >
                      <span className="font-mono">{inv.folderPath || "/"}</span> — excluded: {inv.reason}
                    </div>
                  ))}
                </div>
              ) : null}

              {localDuplicateNameSet.size > 0 ? (
                <div className="mt-2.5 rounded-card border border-red/30 bg-red-soft p-3 text-[11.5px] leading-relaxed text-red">
                  &quot;{[...localDuplicateNameSet].join('", "')}&quot;{" "}
                  {localDuplicateNameSet.size === 1 ? "was" : "were"} detected more than once in this folder — only
                  one of each can be selected.
                </div>
              ) : null}

              {selectedLocalSkills.some((s) => existingNameSet.has(s.name)) ? (
                <div className="mt-2.5 rounded-card border border-red/30 bg-red-soft p-3 text-[11.5px] leading-relaxed text-red">
                  A selected skill&apos;s name already exists in this org — it will fail on upload while the rest of
                  the batch still succeeds.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex justify-end gap-2.5 border-t border-border px-5.5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-border-2 bg-surface px-4 py-2.5 text-[13px] font-semibold text-text"
        >
          Cancel
        </button>
        {mode === "blank" ? (
          <button
            type="button"
            disabled={isPending || !name}
            onClick={submitBlank}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create skill"}
          </button>
        ) : mode === "import" ? (
          <button
            type="button"
            disabled={importDisabled}
            onClick={runImport}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isImporting
              ? "Importing…"
              : `Import ${selectedSkills.length} skill${selectedSkills.length === 1 ? "" : "s"}`}
          </button>
        ) : (
          <button
            type="button"
            disabled={localImportDisabled}
            onClick={runLocalImport}
            className="rounded-control bg-a px-4.5 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow disabled:opacity-50"
          >
            {isUploading
              ? "Uploading…"
              : `Upload ${selectedLocalSkills.length} skill${selectedLocalSkills.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    </Drawer>
  );
}
