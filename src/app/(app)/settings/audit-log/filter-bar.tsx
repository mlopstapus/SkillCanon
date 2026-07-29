"use client";

import { useEffect, useRef, useState } from "react";
import type { AuditActorOption, AuditTransport } from "@/bcs/audit-compliance";
import {
  AUDIT_TRANSPORTS,
  hasActiveFilters,
  type AuditLogFilterState,
  type DateRangePreset,
} from "./filter-params";

const SEARCH_DEBOUNCE_MS = 350;

export interface FilterBarProps {
  filters: AuditLogFilterState;
  resourceOptions: string[];
  actorOptions: AuditActorOption[];
  onChange: (next: Partial<AuditLogFilterState>) => void;
  onClear: () => void;
}

function actorOptionKey(option: AuditActorOption): string {
  return `${option.actorUserId ?? ""}:${option.actorApiKeyId ?? ""}`;
}

const RANGE_LABELS: Record<DateRangePreset, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All within retention",
  custom: "Custom range",
};

export function FilterBar({ filters, resourceOptions, actorOptions, onChange, onClear }: FilterBarProps) {
  const activeActorKey =
    filters.actorUserId || filters.actorApiKeyId
      ? `${filters.actorUserId ?? ""}:${filters.actorApiKeyId ?? ""}`
      : "";

  // The search field is debounced and kept as local state rather than fully
  // controlled by `filters.q`: every other field navigates (a server round
  // trip re-rendering this component with fresh props) on each discrete
  // change, which is fine for a single select/date pick, but doing that on
  // every keystroke drops characters typed faster than the round trip
  // completes (caught via manual browser verification — typing quickly into
  // the search box lost every character but the last one).
  const [searchValue, setSearchValue] = useState(filters.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = undefined;
      onChange({ q: value || undefined });
    }, SEARCH_DEBOUNCE_MS);
  }

  // Resync local state from the URL-derived `filters.q` whenever there's no
  // debounce in flight — covers external changes this component didn't
  // itself just debounce (Clear filters, browser back/forward) without
  // reintroducing the keystroke-dropping race the debounce exists to avoid.
  useEffect(() => {
    if (!debounceRef.current) {
      setSearchValue(filters.q ?? "");
    }
  }, [filters.q]);

  function handleClear() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setSearchValue("");
    onClear();
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2.5 pb-4">
      <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-control border border-border-2 bg-surface px-2.5 py-2">
        <input
          type="search"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search action, resource, actor…"
          aria-label="Search audit events"
          className="w-full bg-transparent text-[12.5px] text-text outline-none placeholder:text-faint"
        />
      </div>

      <label className="sr-only" htmlFor="audit-resource-filter">
        Resource
      </label>
      <select
        id="audit-resource-filter"
        value={filters.resource ?? ""}
        onChange={(e) => onChange({ resource: e.target.value || undefined })}
        className="rounded-control border border-border-2 bg-surface px-3 py-2 font-mono text-[11.5px] text-text"
      >
        <option value="">Resource: all</option>
        {resourceOptions.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="audit-actor-filter">
        Actor
      </label>
      <select
        id="audit-actor-filter"
        value={activeActorKey}
        onChange={(e) => {
          const option = actorOptions.find((o) => actorOptionKey(o) === e.target.value);
          onChange({
            actorUserId: option?.actorUserId ?? undefined,
            actorApiKeyId: option?.actorApiKeyId ?? undefined,
          });
        }}
        className="rounded-control border border-border-2 bg-surface px-3 py-2 font-mono text-[11.5px] text-text"
      >
        <option value="">Actor: all</option>
        {actorOptions.map((option) => (
          <option key={actorOptionKey(option)} value={actorOptionKey(option)}>
            {option.displayName}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="audit-transport-filter">
        Transport
      </label>
      <select
        id="audit-transport-filter"
        value={filters.transport ?? ""}
        onChange={(e) => onChange({ transport: (e.target.value || undefined) as AuditTransport | undefined })}
        className="rounded-control border border-border-2 bg-surface px-3 py-2 font-mono text-[11.5px] text-text"
      >
        <option value="">Transport: all</option>
        {AUDIT_TRANSPORTS.map((transport) => (
          <option key={transport} value={transport}>
            {transport}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="audit-range-filter">
        Date range
      </label>
      <select
        id="audit-range-filter"
        value={filters.range ?? "all"}
        onChange={(e) => onChange({ range: e.target.value as DateRangePreset })}
        className="rounded-control border border-border-2 bg-surface px-3 py-2 font-mono text-[11.5px] text-text"
      >
        {(Object.keys(RANGE_LABELS) as DateRangePreset[]).map((preset) => (
          <option key={preset} value={preset}>
            {RANGE_LABELS[preset]}
          </option>
        ))}
      </select>

      {filters.range === "custom" ? (
        <>
          <input
            type="date"
            aria-label="Custom range start"
            value={filters.from ?? ""}
            onChange={(e) => onChange({ from: e.target.value || undefined })}
            className="rounded-control border border-border-2 bg-surface px-2.5 py-2 font-mono text-[11.5px] text-text"
          />
          <input
            type="date"
            aria-label="Custom range end"
            value={filters.to ?? ""}
            onChange={(e) => onChange({ to: e.target.value || undefined })}
            className="rounded-control border border-border-2 bg-surface px-2.5 py-2 font-mono text-[11.5px] text-text"
          />
        </>
      ) : null}

      {hasActiveFilters(filters) ? (
        <button
          type="button"
          onClick={handleClear}
          className="rounded-control border border-border px-2.5 py-2 font-mono text-[11.5px] text-faint hover:text-text"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
