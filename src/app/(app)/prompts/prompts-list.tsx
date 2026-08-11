"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createPromptAction,
  fetchExternalSkillSourceAction,
  importExternalSkillsAction,
  importLocalSkillsAction,
  scanLocalSkillFoldersAction,
} from "./actions";
import { NewPromptDrawer } from "./new-prompt-drawer";
import { PromptsListView, type PromptListFilters, type PromptListRow, type ProjectOption } from "./prompts-list-view";

const SEARCH_DEBOUNCE_MS = 350;

export interface PromptsListProps {
  rows: PromptListRow[];
  projectOptions: ProjectOption[];
  filters: PromptListFilters;
  /** Every skill name in the org, unfiltered — powers the New Skill drawer's import collision check. */
  existingNames: string[];
}

/**
 * Thin client wrapper owning router context — kept separate from
 * `PromptsListView` per this repo's View/wrapper split convention (a hook
 * requiring real App Router context can't be exercised by this repo's
 * `renderToStaticMarkup`-only test convention). Filters round-trip through
 * the URL query string; search is debounced before navigating, since a
 * per-keystroke navigation drops characters typed faster than the server
 * round trip completes (per this repo's documented audit-log-ui gotcha).
 */
export function PromptsList({ rows, projectOptions, filters, existingNames }: PromptsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchValue, setSearchValue] = useState(filters.q);
  const [newPromptOpen, setNewPromptOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function navigate(next: Partial<PromptListFilters>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.project !== "all") params.set("project", merged.project);
    if (merged.owner !== "all") params.set("owner", merged.owner);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate({ q: value }), SEARCH_DEBOUNCE_MS);
  }

  function handleClearFilters() {
    setSearchValue("");
    navigate({ q: "", project: "all", owner: "all" });
  }

  return (
    <>
      <PromptsListView
        rows={rows}
        projectOptions={projectOptions}
        filters={filters}
        searchValue={searchValue}
        onSearchChange={handleSearchChange}
        onProjectChange={(project) => navigate({ project })}
        onOwnerChange={(owner) => navigate({ owner })}
        onClearFilters={handleClearFilters}
        onNewPrompt={() => setNewPromptOpen(true)}
      />
      {newPromptOpen ? (
        <NewPromptDrawer
          onClose={() => setNewPromptOpen(false)}
          onSubmit={async (values) => {
            const result = await createPromptAction(values);
            if (result.ok) {
              setNewPromptOpen(false);
              // Skill creation no longer publishes v1 (032-skill-file-format-refactor,
              // FR-018) — send the author to the detail page to continue into
              // the same New Version file-bundle flow used for every later version.
              router.push(`/prompts/${values.name}`);
            }
            return result;
          }}
          existingNames={existingNames}
          onFetchImportSource={fetchExternalSkillSourceAction}
          onImportSkills={importExternalSkillsAction}
          onScanLocalFolder={scanLocalSkillFoldersAction}
          onImportLocalSkills={importLocalSkillsAction}
          onImported={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
