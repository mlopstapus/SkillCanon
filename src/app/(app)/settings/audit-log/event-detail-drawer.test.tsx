import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AuditEvent, ResolvedAuditRow } from "@/bcs/audit-compliance";
import { EventDetailDrawer } from "./event-detail-drawer";

const noop = () => {};

function makeRow(overrides: Partial<AuditEvent> = {}, extra: Partial<ResolvedAuditRow> = {}): ResolvedAuditRow {
  const event: AuditEvent = {
    id: "evt_1",
    organizationId: "org_1",
    actorUserId: "user_1",
    actorApiKeyId: null,
    action: "team.updated",
    resourceType: "team",
    resourceId: "team_1",
    before: null,
    after: null,
    transport: "web",
    sourceIp: "10.2.4.18",
    createdAt: new Date("2026-07-23T14:22:07Z"),
    ...overrides,
  };
  return {
    event,
    resourceDisplayName: "Platform",
    resourceNameResolved: true,
    actor: { kind: "user", id: "user_1", displayName: "Alice", subtitle: "admin" },
    ...extra,
  };
}

describe("EventDetailDrawer", () => {
  it("shows a field-by-field diff for a mutation event", () => {
    const row = makeRow({ before: { priority: 30 }, after: { priority: 45 } });
    const markup = renderToStaticMarkup(<EventDetailDrawer row={row} onClose={noop} />);

    expect(markup).toContain("priority");
    expect(markup).toContain("30");
    expect(markup).toContain("45");
    expect(markup).not.toContain("No field-level changes");
  });

  it("shows the authentication no-diff explanation for a login event", () => {
    const row = makeRow({ action: "user.login", before: null, after: null });
    const markup = renderToStaticMarkup(<EventDetailDrawer row={row} onClose={noop} />);

    expect(markup).toContain("Authentication event");
    expect(markup).not.toContain("No field-level changes");
  });

  it("shows the generic no-diff explanation for a non-auth event with no recorded change", () => {
    const row = makeRow({ action: "audit.pruned", before: null, after: null });
    const markup = renderToStaticMarkup(<EventDetailDrawer row={row} onClose={noop} />);

    expect(markup).toContain("No field-level changes recorded");
  });

  it("never renders a redacted field's real value, even though the placeholder itself is shown", () => {
    const row = makeRow({
      action: "apikey.created",
      before: null,
      after: { name: "staging-ci", key_hash: "[REDACTED]" },
    });
    const markup = renderToStaticMarkup(<EventDetailDrawer row={row} onClose={noop} />);

    expect(markup).toContain("key_hash");
    expect(markup).toContain("[REDACTED]");
    expect(markup).not.toMatch(/sk_[A-Za-z0-9]{10,}/);
  });

  it("shows the event's own immutable id in its footer", () => {
    const row = makeRow({ id: "evt_9f3a71c2b8" });
    const markup = renderToStaticMarkup(<EventDetailDrawer row={row} onClose={noop} />);

    expect(markup).toContain("evt_9f3a71c2b8");
    expect(markup).toContain("immutable");
  });
});
