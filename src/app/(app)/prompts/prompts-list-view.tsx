import Link from "next/link";
import { AppState, Badge } from "@/shared/ui";

export interface PromptListRow {
  id: string;
  name: string;
  description: string;
  isDeprecated: boolean;
  isOwnedByMe: boolean;
  projectIds: string[];
  projectLabels: string[];
  ownerLabel: string;
  activeVersion: string | null;
  tags: string[];
  updatedAt: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface PromptListFilters {
  q: string;
  project: string;
  owner: string;
}

export interface PromptsListViewProps {
  rows: PromptListRow[];
  projectOptions: ProjectOption[];
  filters: PromptListFilters;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onProjectChange: (projectId: string) => void;
  onOwnerChange: (owner: string) => void;
  onClearFilters: () => void;
  onNewPrompt: () => void;
}

export function hasActivePromptFilters(filters: PromptListFilters): boolean {
  return filters.q.length > 0 || filters.project !== "all" || filters.owner !== "all";
}

export function PromptsListView({
  rows,
  projectOptions,
  filters,
  searchValue,
  onSearchChange,
  onProjectChange,
  onOwnerChange,
  onClearFilters,
  onNewPrompt,
}: PromptsListViewProps) {
  const activeFilters = hasActivePromptFilters(filters);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-bg px-6.5 pt-4">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="mb-2 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
              Skill registry
            </div>
            <h1 className="font-display text-[22px] font-bold tracking-tight">Skills</h1>
            <p className="mt-1.5 max-w-[560px] text-[12.5px] leading-relaxed text-dim">
              Reusable, versioned templates expanded with governance policies applied. Share a skill
              so teammates can subscribe to updates or make their own editable copy.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewPrompt}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control bg-a px-4 py-2.5 text-[13px] font-semibold text-a-fg shadow-glow"
          >
            + New skill
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5 pb-4">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-control border border-border-2 bg-surface px-2.5 py-2">
            <input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search skills"
              placeholder="Search skills…"
              className="flex-1 bg-transparent text-[12.5px] text-text outline-none"
            />
          </div>
          <select
            aria-label="Filter skills by project"
            value={filters.project}
            onChange={(e) => onProjectChange(e.target.value)}
            className="rounded-control border border-border-2 bg-surface px-3 py-2 font-mono text-[11.5px] text-text outline-none"
          >
            <option value="all">Project: all</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                Project: {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-0.5 rounded-control border border-border-2 bg-surface p-0.5" role="group" aria-label="Filter skills by owner">
            {(["all", "mine", "shared"] as const).map((owner) => (
              <button
                key={owner}
                type="button"
                onClick={() => onOwnerChange(owner)}
                className={`rounded-[7px] px-3 py-1.5 font-mono text-[11px] ${
                  filters.owner === owner ? "bg-a-soft text-a" : "text-dim"
                }`}
              >
                {owner === "all" ? "All" : owner === "mine" ? "Mine" : "Shared with team"}
              </button>
            ))}
          </div>
          {activeFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="flex items-center gap-1.5 rounded-control border border-border px-2.5 py-2 font-mono text-[11.5px] text-faint"
            >
              × Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-[5] grid grid-cols-[minmax(160px,1fr)_110px_120px_80px_130px_90px] gap-2.5 border-b border-border bg-bg px-6.5 py-2.5 font-mono text-[10px] tracking-[0.1em] text-faint uppercase">
          <span>Name</span>
          <span>Project</span>
          <span>Owner</span>
          <span>Version</span>
          <span>Tags</span>
          <span>Updated</span>
        </div>

        {rows.length === 0 ? (
          <AppState
            variant="empty"
            title={activeFilters ? "No skills match these filters" : "No skills yet"}
            description={
              activeFilters
                ? "Try a different project or owner filter, or clear the search."
                : "Create your first skill to start versioning and expanding it with governance applied."
            }
            action={
              activeFilters ? (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="rounded-control border border-border-2 bg-surface px-4 py-2 text-[12.5px] font-semibold"
                >
                  Clear filters
                </button>
              ) : null
            }
          />
        ) : (
          rows.map((row) => (
            <Link
              key={row.id}
              href={`/prompts/${encodeURIComponent(row.name)}`}
              className="grid grid-cols-[minmax(160px,1fr)_110px_120px_80px_130px_90px] items-center gap-2.5 border-b border-border px-6.5 py-3.5 hover:bg-surface"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-[13px] font-semibold text-text">{row.name}</span>
                  {row.isDeprecated ? <Badge>deprecated</Badge> : null}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-dim">{row.description}</div>
              </div>
              <div>
                {row.projectLabels.length > 0 ? (
                  <Badge variant="violet">{row.projectLabels.join(", ")}</Badge>
                ) : null}
              </div>
              <div className="min-w-0 truncate text-[12px] font-mono text-text">{row.ownerLabel}</div>
              <div>
                {row.activeVersion ? <Badge variant="accent">{row.activeVersion}</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-1">
                {row.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
              <div className="font-mono text-[11px] text-faint">{row.updatedAt}</div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
