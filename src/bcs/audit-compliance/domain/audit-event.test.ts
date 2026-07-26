import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_VERB_COLORS,
  AUDIT_ACTION_VERBS,
  AUDIT_TRANSPORTS,
  getAuditActionVerb,
} from "./audit-event";

describe("audit event domain metadata", () => {
  it("documents every current action verb and excludes known-noncanonical invited", () => {
    const currentActions = [
      "organization.created",
      "team.created",
      "team.updated",
      "team.reparented",
      "user.created",
      "user.updated",
      "invitation.created",
      "invitation.accepted",
      "invitation.revoked",
      "api_key.created",
      "api_key.revoked",
      "user.login",
      "user.login_failed",
      "user.logout",
    ];

    const verbs = new Set(AUDIT_ACTION_VERBS);
    for (const action of currentActions) {
      expect(verbs.has(getAuditActionVerb(action) as never)).toBe(true);
    }
    expect(verbs.has("invited" as never)).toBe(false);
  });

  it("keeps each canonical verb mapped to a UI color and exposes the four transports", () => {
    expect(AUDIT_TRANSPORTS).toEqual(["web", "api", "cli", "system"]);
    for (const verb of AUDIT_ACTION_VERBS) {
      expect(AUDIT_ACTION_VERB_COLORS[verb]).toMatch(/^(green|blue|red|violet|neutral)$/);
    }
  });
});
