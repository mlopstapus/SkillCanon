import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { expectNoCriticalOrSeriousAxeViolations } from "@/shared/testing/accessibility";
import type { AuditEvent, ResolvedAuditRow } from "@/bcs/audit-compliance";
import { AuditLogView, type AuditLogViewProps } from "./audit-log-view";

const noop = () => {};

function makeRow(overrides: Partial<AuditEvent> = {}): ResolvedAuditRow {
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
  };
}

function baseProps(overrides: Partial<AuditLogViewProps> = {}): AuditLogViewProps {
  return {
    rows: [],
    total: 0,
    page: 1,
    pageSize: 50,
    retentionDays: 7,
    resourceOptions: [],
    actorOptions: [],
    filters: {},
    onFiltersChange: noop,
    onClearFilters: noop,
    onPageChange: noop,
    ...overrides,
  };
}

describe("AuditLogView", () => {
  it("renders each row with time, action badge, resource name, actor, and transport", () => {
    const markup = renderToStaticMarkup(
      <AuditLogView {...baseProps({ rows: [makeRow()], total: 1 })} />,
    );

    expect(markup).toContain("team.updated");
    expect(markup).toContain("Platform");
    expect(markup).toContain("Alice");
    expect(markup).toContain("web");
  });

  it("shows the retention window in the pagination footer, never a hardcoded value", () => {
    const markup = renderToStaticMarkup(
      <AuditLogView {...baseProps({ rows: [makeRow()], total: 1, retentionDays: 14 })} />,
    );

    expect(markup).toContain("retention 14 days");
    expect(markup).not.toContain("90 days");
    expect(markup).not.toContain("Free");
  });

  it("shows the distinct 'no events at all' empty state, with no Clear filters action, for a zero-event org", async () => {
    const markup = renderToStaticMarkup(<AuditLogView {...baseProps({ total: 0, rows: [] })} />);

    expect(markup).toContain("No audit events yet");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("Clear filters");
    await expectNoCriticalOrSeriousAxeViolations(markup);
  });

  it("shows the distinct 'no match' empty state, with a Clear filters action, when active filters return zero results", async () => {
    // `total` always reflects the *filtered* count (there is no separate
    // unfiltered org-wide count) — a real bug caught via manual browser
    // verification was passing an unrealistic `total: 5` here, which masked
    // the actual `isEmpty`/`isNoMatch` computation being wrong (it always
    // used the filtered `total` for both checks without considering whether
    // a filter was even active).
    const markup = renderToStaticMarkup(
      <AuditLogView {...baseProps({ total: 0, rows: [], filters: { q: "nonexistent" } })} />,
    );

    expect(markup).toContain("No events match these filters");
    expect(markup).toContain("Clear filters");
    expect(markup).not.toContain("No audit events yet");
    await expectNoCriticalOrSeriousAxeViolations(markup);
  });
});
