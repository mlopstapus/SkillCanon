import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Team, UserAccountSummary } from "@/bcs/identity-access";
import { ScopeTree } from "./scope-tree";
import { buildScopeRows, scopeKey, type Scope } from "./scope-tree-data";

const now = new Date("2026-01-01T00:00:00Z");

function makeTeam(overrides: Partial<Team> & Pick<Team, "id" | "name">): Team {
  return {
    organizationId: "org-1",
    slug: overrides.id,
    description: null,
    ownerId: null,
    parentTeamId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserAccountSummary> & Pick<UserAccountSummary, "id" | "displayName" | "teamId">): UserAccountSummary {
  return {
    organizationId: "org-1",
    username: overrides.id,
    email: `${overrides.id}@example.com`,
    role: "member",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const root = makeTeam({ id: "team-root", name: "Acme Corp" });
const engineering = makeTeam({ id: "team-eng", name: "Engineering", parentTeamId: root.id });
const platform = makeTeam({ id: "team-platform", name: "Platform", parentTeamId: engineering.id });
// Sorts alphabetically between "Engineering" and "Platform" but is an
// unrelated root-level sibling — proves tree order, not a flat
// alphabetical sort across the whole org (mirrors teams-explorer.tsx's
// own documented bug history).
const marketing = makeTeam({ id: "team-marketing", name: "Marketing" });

const alice = makeUser({ id: "user-alice", displayName: "alice", teamId: platform.id });
const bob = makeUser({ id: "user-bob", displayName: "bob", teamId: platform.id });

describe("buildScopeRows", () => {
  it("orders teams depth-first, root-first, each team's members immediately after it, before the next sibling", () => {
    const rows = buildScopeRows([root, engineering, platform, marketing], [alice, bob], () => 0);

    expect(rows.map((row) => row.scope.label)).toEqual([
      "Acme Corp",
      "Engineering",
      "Platform",
      "alice",
      "bob",
      "Marketing",
    ]);
  });

  it("assigns depth matching each row's position in the hierarchy", () => {
    const rows = buildScopeRows([root, engineering, platform], [alice], () => 0);
    const byLabel = new Map(rows.map((row) => [row.scope.label, row.depth]));

    expect(byLabel.get("Acme Corp")).toBe(0);
    expect(byLabel.get("Engineering")).toBe(1);
    expect(byLabel.get("Platform")).toBe(2);
    expect(byLabel.get("alice")).toBe(3);
  });

  it("attaches a localCount via the supplied countFor callback", () => {
    const rows = buildScopeRows([root], [], (scope) => (scope.kind === "team" ? 3 : 0));
    expect(rows[0]?.localCount).toBe(3);
  });

  it("excludes a user with no team assignment", () => {
    const unassigned = makeUser({ id: "user-carol", displayName: "carol", teamId: null });
    const rows = buildScopeRows([root], [unassigned], () => 0);
    expect(rows.some((row) => row.scope.label === "carol")).toBe(false);
  });
});

describe("ScopeTree", () => {
  const selectedScope: Scope = { kind: "team", teamId: platform.id, label: "Platform" };

  it("renders every row with its local count badge, and marks the selected scope", () => {
    const rows = buildScopeRows([root, engineering, platform], [alice], (scope) =>
      scope.kind === "team" && scope.teamId === platform.id ? 2 : 0,
    );

    const html = renderToStaticMarkup(
      <ScopeTree rows={rows} selectedScope={selectedScope} filterText="" onFilterChange={() => {}} onSelect={() => {}} />,
    );

    expect(html).toContain("Platform");
    expect(html).toContain("alice");
    expect(html).toContain(">2<");
    expect(html).toContain(`aria-current="true"`);
  });

  it("hides the count badge for a scope with zero local items", () => {
    const rows = buildScopeRows([root], [], () => 0);
    const html = renderToStaticMarkup(
      <ScopeTree rows={rows} selectedScope={{ kind: "team", teamId: root.id, label: root.name }} filterText="" onFilterChange={() => {}} onSelect={() => {}} />,
    );
    expect(html).not.toContain(">0<");
  });

  it("shows a no-match message when the filter excludes every row", () => {
    const rows = buildScopeRows([root, platform], [], () => 0);
    const html = renderToStaticMarkup(
      <ScopeTree rows={rows} selectedScope={selectedScope} filterText="zzz-no-match" onFilterChange={() => {}} onSelect={() => {}} />,
    );
    expect(html).toContain("No teams or people match");
  });

  it("filters rows by label, case-insensitively", () => {
    const rows = buildScopeRows([root, engineering, platform], [alice], () => 0);
    const html = renderToStaticMarkup(
      <ScopeTree rows={rows} selectedScope={selectedScope} filterText="ALICE" onFilterChange={() => {}} onSelect={() => {}} />,
    );
    expect(html).toContain("alice");
    expect(html).not.toContain("Platform");
  });
});

describe("scopeKey", () => {
  it("distinguishes a team scope from a person scope with the same id shape", () => {
    const team: Scope = { kind: "team", teamId: "x", label: "X" };
    const person: Scope = { kind: "person", userId: "x", teamId: null, label: "X" };
    expect(scopeKey(team)).not.toBe(scopeKey(person));
  });
});
