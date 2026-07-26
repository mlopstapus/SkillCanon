import {
  AUDIT_TRANSPORTS,
  REDACTED_KEYS,
  type NewAuditEvent,
} from "../domain/audit-event";
import { insert } from "../infrastructure/audit-events-repo";

type Tx = Parameters<typeof insert>[0];

const REDACTED_PLACEHOLDER = "[REDACTED]";

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = (REDACTED_KEYS as readonly string[]).includes(key)
        ? REDACTED_PLACEHOLDER
        : redact(val);
    }
    return result;
  }
  return value;
}

/**
 * Inserts one audit event, redacting known-sensitive fields from
 * `before`/`after` first. Only callable from inside an open transaction
 * (`tx`) — never a standalone unaudited write path
 * (backlog/003-audit-compliance/001-audit-event-schema-and-write-path.md).
 */
export async function record(tx: Tx, event: NewAuditEvent): Promise<void> {
  if (!(AUDIT_TRANSPORTS as readonly string[]).includes(event.transport)) {
    throw new Error("Audit event transport must be one of web, api, cli, or system.");
  }

  await insert(tx, {
    ...event,
    before: event.before == null ? null : redact(event.before),
    after: event.after == null ? null : redact(event.after),
  });
}
