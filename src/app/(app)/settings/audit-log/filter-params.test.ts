import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  parseFilterState,
  resolveDateRange,
  toAuditEventFilters,
} from "./filter-params";

describe("parseFilterState", () => {
  it("reads each filter field from the URL search params", () => {
    const state = parseFilterState({
      q: "policy",
      resource: "policy",
      actorUserId: "user-1",
      transport: "web",
      range: "7d",
      page: "2",
    });

    expect(state).toMatchObject({
      q: "policy",
      resource: "policy",
      actorUserId: "user-1",
      transport: "web",
      range: "7d",
      page: "2",
    });
  });

  it("takes the first value when a param repeats", () => {
    const state = parseFilterState({ q: ["a", "b"] });
    expect(state.q).toBe("a");
  });
});

describe("resolveDateRange", () => {
  const now = new Date("2026-07-28T12:00:00Z");

  it("returns no bounds for 'all'", () => {
    expect(resolveDateRange({ range: "all" }, now)).toEqual({});
  });

  it("returns no bounds when range is unset", () => {
    expect(resolveDateRange({}, now)).toEqual({});
  });

  it("resolves '24h' to a cutoff one day back", () => {
    const { createdAtFrom, createdAtTo } = resolveDateRange({ range: "24h" }, now);
    expect(createdAtFrom).toEqual(new Date("2026-07-27T12:00:00Z"));
    expect(createdAtTo).toBeUndefined();
  });

  it("resolves '7d' to a cutoff seven days back", () => {
    const { createdAtFrom } = resolveDateRange({ range: "7d" }, now);
    expect(createdAtFrom).toEqual(new Date("2026-07-21T12:00:00Z"));
  });

  it("resolves 'custom' to the given from/to dates", () => {
    const result = resolveDateRange(
      { range: "custom", from: "2026-07-01", to: "2026-07-10" },
      now,
    );
    expect(result.createdAtFrom).toEqual(new Date("2026-07-01"));
    expect(result.createdAtTo).toEqual(new Date("2026-07-10"));
  });

  it("ignores an unparseable custom date", () => {
    const result = resolveDateRange({ range: "custom", from: "not-a-date" }, now);
    expect(result.createdAtFrom).toBeUndefined();
  });
});

describe("toAuditEventFilters", () => {
  const now = new Date("2026-07-28T12:00:00Z");

  it("maps filter state onto AuditEventFilters", () => {
    const filters = toAuditEventFilters(
      { q: "alice", resource: "team", transport: "web", range: "7d", page: "3" },
      now,
    );
    expect(filters).toMatchObject({
      search: "alice",
      resourceType: "team",
      transport: "web",
      page: 3,
    });
    expect(filters.createdAtFrom).toEqual(new Date("2026-07-21T12:00:00Z"));
  });

  it("drops an invalid transport value rather than passing it through", () => {
    const filters = toAuditEventFilters({ transport: "carrier-pigeon" as never }, now);
    expect(filters.transport).toBeUndefined();
  });

  it("drops a non-positive page value", () => {
    const filters = toAuditEventFilters({ page: "0" }, now);
    expect(filters.page).toBeUndefined();
  });
});

describe("hasActiveFilters", () => {
  it("is false with no filters", () => {
    expect(hasActiveFilters({})).toBe(false);
  });

  it("is false with range 'all' only", () => {
    expect(hasActiveFilters({ range: "all" })).toBe(false);
  });

  it("is true when search text is set", () => {
    expect(hasActiveFilters({ q: "x" })).toBe(true);
  });

  it("is true when a non-'all' range is set", () => {
    expect(hasActiveFilters({ range: "7d" })).toBe(true);
  });
});
