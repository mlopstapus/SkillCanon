export interface ExportControlProps {
  /**
   * `undefined` (today's actual state — no export entitlement key exists
   * yet) hides the control entirely (FR-014). Once a real key exists,
   * `false` renders a disabled, explained control and `true` an enabled one.
   */
  canExport?: boolean;
}

export function ExportControl({ canExport }: ExportControlProps) {
  if (canExport === undefined) {
    return null;
  }

  if (!canExport) {
    return (
      <button
        type="button"
        disabled
        title="Exporting the audit trail requires a plan with audit export enabled."
        className="flex items-center gap-2 rounded-control border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold text-faint opacity-75"
      >
        Export
      </button>
    );
  }

  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-control border border-border-2 bg-surface px-3.5 py-2 text-[13px] font-semibold text-text"
    >
      Export
    </button>
  );
}
