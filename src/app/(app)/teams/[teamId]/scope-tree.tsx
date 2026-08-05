"use client";

import { cn } from "@/shared/ui";
import { scopeKey, type Scope, type ScopeRow } from "./scope-tree-data";

export interface ScopeTreeProps {
  rows: ScopeRow[];
  selectedScope: Scope;
  filterText: string;
  onFilterChange: (text: string) => void;
  onSelect: (scope: Scope) => void;
}

function matchesFilter(row: ScopeRow, filterText: string): boolean {
  if (!filterText.trim()) return true;
  return row.scope.label.toLowerCase().includes(filterText.trim().toLowerCase());
}

export function ScopeTree({ rows, selectedScope, filterText, onFilterChange, onSelect }: ScopeTreeProps) {
  const selectedKey = scopeKey(selectedScope);
  const visibleRows = rows.filter((row) => matchesFilter(row, filterText));

  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-panel">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <span className="font-display text-[13.5px] font-semibold">Scope</span>
        <span className="rounded-control border border-border px-2 py-0.5 font-mono text-[10.5px] text-faint">
          team tree
        </span>
      </div>
      <div className="px-3.5 pb-2 pt-3">
        <input
          value={filterText}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Filter teams & people"
          aria-label="Filter teams and people"
          className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none focus:border-a"
        />
      </div>
      <nav aria-label="Governance scope" className="flex-1 overflow-y-auto px-2 pb-4 pt-1.5">
        {visibleRows.length === 0 ? (
          <p className="px-2 py-4 text-[12px] text-faint">No teams or people match &ldquo;{filterText}&rdquo;.</p>
        ) : (
          visibleRows.map((row) => {
            const key = scopeKey(row.scope);
            const selected = key === selectedKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(row.scope)}
                aria-current={selected ? "true" : undefined}
                style={{ paddingLeft: 10 + row.depth * 15 }}
                className={cn(
                  "mb-0.5 flex w-full items-center gap-2 rounded-control border py-1.5 pr-2.5 text-left text-[12.5px] font-medium",
                  selected
                    ? "border-a/40 bg-a-soft text-text"
                    : "border-transparent text-dim hover:bg-surface",
                )}
              >
                {row.scope.kind === "person" ? (
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full border border-border-2 bg-surface-2 font-mono text-[10px] text-dim">
                    {row.scope.label[0]?.toUpperCase()}
                  </span>
                ) : (
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-control border border-border-2 bg-surface-2" aria-hidden="true" />
                )}
                <span className="flex-1 truncate">{row.scope.label}</span>
                {row.localCount > 0 ? (
                  <span className="rounded-control border border-border bg-surface-2 px-1.5 py-px font-mono text-[10px] text-dim">
                    {row.localCount}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </nav>
      <div className="border-t border-border px-4 py-3 font-mono text-[10.5px] leading-[1.5] text-faint">
        Numbers show policies + objectives defined <span className="text-dim">locally</span> at that node.
      </div>
    </aside>
  );
}
