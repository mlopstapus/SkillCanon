import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AuditExportEntitlementRequiredError,
  UnsupportedAuditExportFormatError,
  type AuditEvent,
} from "../domain/audit-event";
import { exportAuditEvents, formatAuditEventsCsv } from "./export";

describe("exportAuditEvents", () => {
  it("rejects export by default until a live entitlement grants it", async () => {
    await expect(exportAuditEvents({} as never, randomUUID(), "csv")).rejects.toThrow(
      AuditExportEntitlementRequiredError,
    );
  });

  it("rejects unsupported export formats", async () => {
    await expect(exportAuditEvents({} as never, randomUUID(), "json" as never)).rejects.toThrow(
      UnsupportedAuditExportFormatError,
    );
  });

  it("formats retained audit rows as escaped CSV", () => {
    const event: AuditEvent = {
      id: "event-1",
      organizationId: "org-1",
      actorUserId: "user-1",
      actorApiKeyId: null,
      action: "policy.updated",
      resourceType: "policy",
      resourceId: "11111111-1111-1111-1111-111111111111",
      before: null,
      after: { note: 'quote "and" comma, ok' },
      transport: "web",
      sourceIp: null,
      createdAt: new Date("2026-07-24T12:00:00Z"),
    };

    const csv = formatAuditEventsCsv([event]);
    const [header, row, trailing] = csv.split("\n");

    expect(header).toBe(
      "id,organizationId,actorUserId,actorApiKeyId,action,resourceType,resourceId,before,after,transport,sourceIp,createdAt",
    );
    expect(row).toContain("event-1,org-1,user-1,,policy.updated,policy");
    expect(row).toContain("quote");
    expect(row).toContain("comma, ok");
    expect(row).toContain(",web,,");
    expect(row).toContain("2026-07-24T12:00:00.000Z");
    expect(trailing).toBe("");
  });
});
