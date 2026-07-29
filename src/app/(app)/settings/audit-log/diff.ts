export interface DiffRow {
  key: string;
  before: string | null;
  after: string | null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "∅";
  }
  if (Array.isArray(value)) {
    return `[${value.join(", ")}]`;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Field-by-field before/after diff for the detail drawer. Never re-derives
 * or reverses redaction — `before`/`after` arrive already redacted by
 * `record()` (FR-010); this only ever renders whatever it's given.
 */
export function diffOf(before: unknown, after: unknown): DiffRow[] {
  if (!before && !after) {
    return [];
  }
  const beforeObj = (before ?? {}) as Record<string, unknown>;
  const afterObj = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

  const rows: DiffRow[] = [];
  for (const key of keys) {
    const hasBefore = before !== null && before !== undefined && key in beforeObj;
    const hasAfter = after !== null && after !== undefined && key in afterObj;
    const beforeVal = hasBefore ? beforeObj[key] : undefined;
    const afterVal = hasAfter ? afterObj[key] : undefined;
    const changed = formatValue(beforeVal) !== formatValue(afterVal);
    if (!changed) {
      continue;
    }
    rows.push({
      key,
      before: hasBefore ? formatValue(beforeVal) : null,
      after: hasAfter ? formatValue(afterVal) : null,
    });
  }
  return rows;
}
