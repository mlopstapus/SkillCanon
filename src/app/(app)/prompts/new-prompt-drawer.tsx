"use client";

import { useId, useState, useTransition } from "react";
import { Drawer } from "@/shared/ui";
import type { ExternalSkillCandidate } from "@/bcs/prompt-registry";
import type {
  FetchExternalSkillSourceResult,
  ImportExternalSkillsActionResult,
  PromptActionResult,
} from "./actions";

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
  /** Called after at least one skill imports successfully, so the caller can refresh the list. */
  onImported: () => void;
}

type NewSkillMode = "blank" | "import";

/**
 * Collects only name/description/tags (032-skill-file-format-refactor,
 * FR-018) — the skill's first version content (main file plus any
 * supporting files) is authored through the same New Version file-bundle
 * flow used for every later version, not a separate template-entry form
 * here. `onSubmit` is expected to create the skill shell and then hand off
 * to that flow (e.g. by navigating to the new skill's detail page).
 *
 * The Import mode (013-skill-import-and-external-registries) is a fully
 * separate path: it fetches an external GitHub source, lets the caller pick
 * which of the skills found there to bring in, and hands the selected ones
 * straight to `onImportSkills` — no intermediate New Version step, since
 * the fetched content already has everything `publishVersion` needs.
 */
export function NewPromptDrawer({
  onClose,
  onSubmit,
  existingNames,
  onFetchImportSource,
  onImportSkills,
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

  const existingNameSet = new Set(existingNames);

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
      ) : (
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
            <div className="mt-2 flex items-center gap-2 rounded-control border border-border bg-bg px-3 py-2.5">
              <span className="shrink-0 font-mono text-[9.5px] tracking-[0.06em] text-faint">CLI</span>
              <span className="h-3 w-px shrink-0 bg-border-2" />
              <span className="font-mono text-[11.5px] break-all text-dim">
                <span className="text-a-2">npx</span> skills add {source.trim() || "<source>"}
              </span>
            </div>
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
        ) : (
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
        )}
      </div>
    </Drawer>
  );
}
