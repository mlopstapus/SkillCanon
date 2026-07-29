import { describe, expect, it } from "vitest";
import { diffOf } from "./diff";

describe("diffOf", () => {
  it("returns an empty diff for two null states (e.g. login/logout)", () => {
    expect(diffOf(null, null)).toEqual([]);
  });

  it("shows only fields that actually changed", () => {
    const rows = diffOf({ priority: 30, mode: "prepend" }, { priority: 45, mode: "prepend" });
    expect(rows).toEqual([{ key: "priority", before: "30", after: "45" }]);
  });

  it("shows a create (before: null) as after-only for every field", () => {
    const rows = diffOf(null, { name: "incident-postmortem" });
    expect(rows).toEqual([{ key: "name", before: null, after: "incident-postmortem" }]);
  });

  it("shows a delete/revoke (after has no value for changed keys) as before-only", () => {
    const rows = diffOf({ status: "active" }, { status: "revoked" });
    expect(rows).toEqual([{ key: "status", before: "active", after: "revoked" }]);
  });

  it("still shows a changed field even when the value is a redacted placeholder string, without exposing anything beyond what's given", () => {
    // record()'s redaction has already replaced the real key_hash by the time
    // this runs — diffOf never sees or could reconstruct the original value.
    const rows = diffOf(null, { name: "staging-ci", key_hash: "[redacted]" });
    expect(rows).toContainEqual({ key: "key_hash", before: null, after: "[redacted]" });
    expect(JSON.stringify(rows)).not.toMatch(/sk_[A-Za-z0-9]/);
  });

  it("formats arrays and nested objects readably", () => {
    const rows = diffOf({ scopes: [] }, { scopes: ["Design"] });
    expect(rows).toEqual([{ key: "scopes", before: "[]", after: "[Design]" }]);
  });
});
