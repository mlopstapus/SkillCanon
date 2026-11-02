import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPlan, buildPlan, formatReport, parseCsv, parseRoster, type RestCall } from "./org-import.mjs";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "e2e/fixtures/org", name), "utf8");
const rows = () => parseRoster(fixture("roster.csv"));
const mapping = () => JSON.parse(fixture("teams.json")) as Record<string, string>;

/** An in-memory stand-in for the REST routes the importer uses. */
function fakeServer() {
  const teams: Array<Record<string, unknown>> = [{ id: "t-root", name: "Tribe", slug: "tribe", parentTeamId: null, ownerId: null }];
  const users: Array<Record<string, unknown>> = [];
  const writes: string[] = [];
  let n = 0;
  const call: RestCall = async (method, path, body) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const page = (items: unknown[]) => ({ ok: true, status: 200, json: { items, total: items.length } });
    if (method === "GET" && path.startsWith("/api/teams")) return page(teams);
    if (method === "GET" && path.startsWith("/api/users")) return page(users);
    writes.push(`${method} ${path}`);
    if (method === "POST" && path === "/api/teams") {
      const t = { id: `t-${++n}`, ownerId: null, ...b };
      teams.push(t);
      return { ok: true, status: 201, json: t };
    }
    if (method === "POST" && path.endsWith("/reparent")) {
      const t = teams.find((x) => x.id === path.split("/")[3])!;
      t.parentTeamId = b.newParentTeamId;
      return { ok: true, status: 200, json: t };
    }
    if (method === "PUT" && path.startsWith("/api/teams/")) {
      Object.assign(teams.find((x) => x.id === path.split("/")[3])!, b);
      return { ok: true, status: 200, json: {} };
    }
    if (method === "POST" && path === "/api/users") {
      const u = { id: `u-${++n}`, ...b };
      users.push(u);
      return { ok: true, status: 201, json: u };
    }
    if (method === "PUT" && path.startsWith("/api/users/")) {
      Object.assign(users.find((x) => x.id === path.split("/")[3])!, b);
      return { ok: true, status: 200, json: {} };
    }
    return { ok: false, status: 404, json: {} };
  };
  return { call, teams, users, writes };
}

describe("parseCsv", () => {
  it("handles quoted commas, doubled quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\nd,e,f\r\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["d", "e", "f"],
    ]);
  });

  it("reads the fixture roster: 25 people and a title with a comma", () => {
    const r = rows();
    expect(r).toHaveLength(25);
    expect(r.find((x) => x.name === "Morgan Vale")?.title).toBe("Head of Talent, Acquisition");
  });

  it("names a missing column", () => {
    expect(() => parseRoster("name,email\nA,a@example.test")).toThrow(/title, department, manager_email/);
  });
});

describe("buildPlan", () => {
  const plan = buildPlan(rows(), mapping());
  const team = (slug: string) => plan.teams.find((t) => t.slug === slug);

  it("makes one team per manager, owned by them, and a Squad team for the manager missing from the mapping", () => {
    expect(plan.teams.map((t) => t.name).sort()).toEqual(["Engineering & Product", "Executive", "Recruiting", "Squad: Gus Penn", "Talent"]);
    expect(team("org-talent")?.ownerEmail).toBe("morgan.vale@example.test");
    expect(plan.squads).toEqual([{ email: "gus.penn@example.test", name: "Squad: Gus Penn" }]);
  });

  it("parents a team under its manager's own team", () => {
    expect(team("org-recruiting")?.parentSlug).toBe("org-talent");
    expect(team("org-squad-gus-penn")?.parentSlug).toBe("org-engineering-product");
    expect(team("org-talent")?.parentSlug).toBe("org-executive");
    expect(team("org-executive")?.parentSlug).toBeNull();
  });

  it("puts a manager in the team they own, others in their manager's, and a person with no manager in Executive", () => {
    const where = (email: string) => plan.members.find((m) => m.email === email)?.teamSlug;
    expect(where("morgan.vale@example.test")).toBe("org-talent");
    expect(where("ash.pell@example.test")).toBe("org-recruiting");
    expect(where("hal.reeve@example.test")).toBe("org-squad-gus-penn");
    expect(where("avery.quill@example.test")).toBe("org-executive");
    expect(where("sam.ellery@example.test")).toBe("org-executive");
  });

  it("reports invalid rows, a manager outside the roster, and loops, without inventing anything", () => {
    const odd = buildPlan(
      parseRoster(
        "name,email,title,department,manager_email\nA One,a@example.test,t,d,ghost@example.test\nB Two,not-an-email,t,d,\nC Three,c@example.test,t,d,d@example.test\nD Four,d@example.test,t,d,c@example.test\n",
      ),
      {},
    );
    expect(odd.invalid).toEqual([{ line: 3, email: "not-an-email", reason: "missing name or invalid email" }]);
    expect(odd.warnings.join("\n")).toMatch(/ghost@example.test is not in the roster/);
    expect(odd.warnings.join("\n")).toMatch(/reporting loop/);
    expect(odd.members.map((m) => m.email).sort()).toEqual(["a@example.test", "c@example.test", "d@example.test"]);
  });
});

describe("applyPlan", () => {
  it("builds the tree, then a second run changes nothing and writes nothing", async () => {
    const server = fakeServer();
    const plan = buildPlan(rows(), mapping());

    const first = await applyPlan(plan, { call: server.call });
    expect(first.errors).toEqual([]);
    expect(first.teams.created).toBe(5);
    expect(first.people).toMatchObject({ created: 25, moved: 0, unchanged: 0 });
    expect(first.needPasswordReset).toHaveLength(25);
    const owner = (slug: string) => server.users.find((u) => u.id === server.teams.find((t) => t.slug === slug)?.ownerId)?.email;
    expect(owner("org-talent")).toBe("morgan.vale@example.test");
    expect(owner("org-squad-gus-penn")).toBe("gus.penn@example.test");
    expect(server.teams.find((t) => t.slug === "org-executive")?.parentTeamId).toBe("t-root");

    const before = server.writes.length;
    const second = await applyPlan(plan, { call: server.call });
    expect(server.writes.length).toBe(before);
    expect(second.teams).toEqual({ created: 0, updated: 0, unchanged: 5 });
    expect(second.people).toEqual({ created: 0, moved: 0, unchanged: 25 });
  });

  it("moves only the person who moved, and reports someone no longer in the roster without deleting them", async () => {
    const server = fakeServer();
    await applyPlan(buildPlan(rows(), mapping()), { call: server.call });

    const moved = rows().map((r) => (r.email === "dana.wick@example.test" ? { ...r, manager_email: "lane.ferris@example.test" } : r));
    const withoutOak = moved.filter((r) => r.email !== "oak.verne@example.test");
    const report = await applyPlan(buildPlan(withoutOak, mapping()), { call: server.call });

    expect(report.people).toMatchObject({ created: 0, moved: 1 });
    expect(report.removedFromRoster).toEqual(["oak.verne@example.test"]);
    expect(server.users.some((u) => u.email === "oak.verne@example.test")).toBe(true);
    expect(formatReport(report)).toContain("not deleted");
  });

  it("writes nothing on a dry run, and fails clearly with several top-level teams", async () => {
    const server = fakeServer();
    const dry = await applyPlan(buildPlan(rows(), mapping()), { call: server.call, dryRun: true });
    expect(server.writes).toEqual([]);
    expect(dry.teams.created).toBe(5);

    server.teams.push({ id: "t-x", name: "Other", slug: "other", parentTeamId: null });
    const ambiguous = await applyPlan(buildPlan(rows(), mapping()), { call: server.call });
    expect(ambiguous.errors[0]).toMatch(/--root-team/);
  });

  it("reports a REST failure as an error", async () => {
    const server = fakeServer();
    const failing: RestCall = async (m, p, b) =>
      m === "POST" && p === "/api/users" ? { ok: false, status: 422, json: { error: "bad" } } : server.call(m, p, b);
    const report = await applyPlan(buildPlan(rows(), mapping()), { call: failing });
    expect(report.errors.length).toBeGreaterThan(0);
  });
});
