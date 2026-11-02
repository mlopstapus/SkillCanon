// Pure planning and REST application for `pnpm import:org` (019/001). No I/O of its own:
// the CLI wrapper reads files and supplies `call`, so both halves are unit-testable.
import { randomBytes } from "node:crypto";

export const COLUMNS = ["name", "email", "title", "department", "manager_email"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function parseRoster(csvText) {
  const [header, ...body] = parseCsv(csvText);
  if (!header) throw new Error("The roster is empty.");
  const index = Object.fromEntries(COLUMNS.map((c) => [c, header.map((h) => h.trim().toLowerCase()).indexOf(c)]));
  const missing = COLUMNS.filter((c) => index[c] === -1);
  if (missing.length > 0) throw new Error(`The roster is missing column(s): ${missing.join(", ")}.`);
  return body.map((fields, i) => ({
    line: i + 2,
    ...Object.fromEntries(COLUMNS.map((c) => [c, (fields[index[c]] ?? "").trim()])),
  }));
}

/**
 * Turns roster rows and a `manager_email -> team name` mapping into a plan.
 * Invented nothing: every team and person comes from the files.
 */
export function buildPlan(rows, mapping) {
  const invalid = [];
  const people = new Map();
  for (const row of rows) {
    const email = row.email.toLowerCase();
    if (!row.name || !EMAIL.test(email)) {
      invalid.push({ line: row.line, email: row.email, reason: "missing name or invalid email" });
    } else if (people.has(email)) {
      invalid.push({ line: row.line, email: row.email, reason: "duplicate email" });
    } else {
      people.set(email, { email, name: row.name, title: row.title, managerEmail: row.manager_email.toLowerCase() || null });
    }
  }

  const warnings = [];
  for (const p of people.values()) {
    if (p.managerEmail && !people.has(p.managerEmail)) {
      warnings.push(`${p.email}: manager ${p.managerEmail} is not in the roster; treated as having no manager.`);
      p.managerEmail = null;
    }
  }
  // Break reporting loops so the tree is finite; report each.
  for (const p of people.values()) {
    const seen = new Set([p.email]);
    for (let m = p.managerEmail; m; m = people.get(m)?.managerEmail) {
      if (seen.has(m)) {
        warnings.push(`${p.email}: reporting loop through ${m}; treated as having no manager.`);
        p.managerEmail = null;
        break;
      }
      seen.add(m);
    }
  }

  const reports = new Map();
  for (const p of people.values()) {
    if (p.managerEmail) reports.set(p.managerEmail, [...(reports.get(p.managerEmail) ?? []), p.email]);
  }
  const normalizedMapping = Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k.toLowerCase(), v]));
  for (const email of Object.keys(normalizedMapping)) {
    if (!people.has(email)) warnings.push(`mapping: ${email} is not in the roster.`);
  }

  const teams = new Map(); // slug -> { slug, name, ownerEmail, parentSlug, squad }
  const teamOf = new Map(); // manager email -> team slug
  const squads = [];
  const hasNoManager = [...people.values()].some((p) => !p.managerEmail);
  const executive = { slug: `org-${slugify("Executive")}`, name: "Executive" };
  if (hasNoManager) teams.set(executive.slug, { ...executive, ownerEmail: null, parentSlug: null, squad: false });

  const managers = [...people.values()].filter((p) => reports.has(p.email));
  for (const m of managers) {
    const mapped = normalizedMapping[m.email];
    const name = mapped ?? `Squad: ${m.name}`;
    const slug = `org-${slugify(name)}`;
    teamOf.set(m.email, slug);
    if (!mapped) squads.push({ email: m.email, name });
    const existing = teams.get(slug);
    if (existing) {
      if (existing.ownerEmail && existing.ownerEmail !== m.email) {
        warnings.push(`team "${name}" is mapped for several managers; ${existing.ownerEmail} owns it.`);
      } else if (!existing.ownerEmail) existing.ownerEmail = m.email;
    } else {
      teams.set(slug, { slug, name, ownerEmail: m.email, parentSlug: null, squad: !mapped });
    }
  }
  for (const m of managers) {
    const team = teams.get(teamOf.get(m.email));
    if (team.ownerEmail !== m.email || team.parentSlug !== null) continue;
    const parent = m.managerEmail ? teamOf.get(m.managerEmail) : null;
    team.parentSlug = parent && parent !== team.slug ? parent : null;
  }
  // A cycle between teams (mapping oddities) falls back to the root.
  for (const t of teams.values()) {
    const seen = new Set([t.slug]);
    for (let s = t.parentSlug; s; s = teams.get(s)?.parentSlug ?? null) {
      if (seen.has(s)) {
        warnings.push(`team "${t.name}": parent loop; placed at the top level.`);
        t.parentSlug = null;
        break;
      }
      seen.add(s);
    }
  }

  const members = [...people.values()].map((p) => ({
    email: p.email,
    name: p.name,
    managerEmail: p.managerEmail,
    teamSlug: teamOf.get(p.email) ?? (p.managerEmail ? teamOf.get(p.managerEmail) : executive.slug),
  }));

  return { teams: [...teams.values()], members, squads, invalid, warnings };
}

function depth(team, bySlug) {
  let d = 0;
  for (let s = team.parentSlug; s; s = bySlug.get(s)?.parentSlug ?? null) d++;
  return d;
}

/** Applies a plan through REST. `call(method, path, body?)` returns `{ ok, status, json }`. Writes only what differs. */
export async function applyPlan(plan, { call, rootTeamSlug, dryRun = false }) {
  const errors = [];
  const report = {
    teams: { created: 0, updated: 0, unchanged: 0 },
    people: { created: 0, moved: 0, unchanged: 0, managersSet: 0 },
    squadsToName: plan.squads.map((s) => s.name),
    invalid: plan.invalid,
    warnings: [...plan.warnings],
    removedFromRoster: [],
    needPasswordReset: [],
    errors,
  };

  async function list(path) {
    const out = [];
    for (let page = 1; ; page++) {
      const r = await call("GET", `${path}?page=${page}&pageSize=100`);
      if (!r.ok) {
        errors.push(`GET ${path} -> ${r.status}`);
        return out;
      }
      out.push(...(r.json.items ?? []));
      if (!r.json.items?.length || out.length >= (r.json.total ?? 0)) return out;
    }
  }
  async function write(method, path, body) {
    if (dryRun) return { ok: true, json: { id: `dry-${path}` } };
    const r = await call(method, path, body);
    if (!r.ok) errors.push(`${method} ${path} -> ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
    return r;
  }

  const existingTeams = await list("/api/teams");
  const existingUsers = await list("/api/users");
  if (errors.length > 0) return report;

  const roots = existingTeams.filter((t) => !t.parentTeamId);
  const root = rootTeamSlug ? existingTeams.find((t) => t.slug === rootTeamSlug) : roots.length === 1 ? roots[0] : null;
  if (!root) {
    errors.push(rootTeamSlug ? `No team with slug "${rootTeamSlug}".` : `Found ${roots.length} top-level teams; pass --root-team <slug>.`);
    return report;
  }

  const teamBySlug = new Map(existingTeams.map((t) => [t.slug, t]));
  const userByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
  const planBySlug = new Map(plan.teams.map((t) => [t.slug, t]));
  const parentIdFor = (t) => (t.parentSlug ? teamBySlug.get(t.parentSlug)?.id : root.id);

  const touched = new Set(); // slugs created or changed, for the unchanged count

  // 1. Teams, parents first.
  for (const t of [...plan.teams].sort((a, b) => depth(a, planBySlug) - depth(b, planBySlug))) {
    const parentTeamId = parentIdFor(t);
    const existing = teamBySlug.get(t.slug);
    if (!existing) {
      const r = await write("POST", "/api/teams", { name: t.name, slug: t.slug, parentTeamId });
      if (r.ok) teamBySlug.set(t.slug, { ...r.json, slug: t.slug, parentTeamId });
      report.teams.created++;
      touched.add(t.slug);
    } else if (existing.parentTeamId !== parentTeamId) {
      await write("POST", `/api/teams/${existing.id}/reparent`, { newParentTeamId: parentTeamId });
      existing.parentTeamId = parentTeamId;
      report.teams.updated++;
      touched.add(t.slug);
    }
  }

  // 2. People: create, or move when their team differs.
  const usernames = new Set(existingUsers.map((u) => u.username));
  for (const m of plan.members) {
    const team = teamBySlug.get(m.teamSlug);
    if (!team) continue;
    const existing = userByEmail.get(m.email);
    if (existing) {
      if (existing.teamId !== team.id) {
        await write("PUT", `/api/users/${existing.id}`, { teamId: team.id });
        existing.teamId = team.id;
        report.people.moved++;
      } else report.people.unchanged++;
      continue;
    }
    let username = m.email.split("@")[0];
    for (let n = 2; usernames.has(username); n++) username = `${m.email.split("@")[0]}${n}`;
    usernames.add(username);
    const r = await write("POST", "/api/users", {
      teamId: team.id,
      username,
      displayName: m.name,
      email: m.email,
      password: randomBytes(24).toString("base64url"),
      role: "member",
    });
    if (r.ok) userByEmail.set(m.email, { ...r.json, email: m.email, teamId: team.id });
    report.people.created++;
    report.needPasswordReset.push(m.email);
  }

  // 2b. Reporting lines (019/002): managerId follows manager_email, set once everyone exists.
  for (const m of plan.members) {
    const existing = userByEmail.get(m.email);
    const managerId = (m.managerEmail && userByEmail.get(m.managerEmail)?.id) || null;
    if (!existing || (existing.managerId ?? null) === managerId) continue;
    await write("PUT", `/api/users/${existing.id}`, { managerId });
    existing.managerId = managerId;
    report.people.managersSet++;
  }

  // 3. Owners, now that the people exist.
  for (const t of plan.teams) {
    const team = teamBySlug.get(t.slug);
    const owner = t.ownerEmail ? userByEmail.get(t.ownerEmail) : null;
    if (!team || !owner || team.ownerId === owner.id) continue;
    await write("PUT", `/api/teams/${team.id}`, { ownerId: owner.id });
    team.ownerId = owner.id;
    if (!touched.has(t.slug)) report.teams.updated++;
    touched.add(t.slug);
  }
  report.teams.unchanged = plan.teams.length - touched.size;

  // 4. Roster people who left: anyone in a roster-managed team who is not in the roster.
  const rosterEmails = new Set(plan.members.map((m) => m.email));
  const managedIds = new Set([...plan.teams].map((t) => teamBySlug.get(t.slug)?.id).filter(Boolean));
  for (const u of existingUsers) {
    if (managedIds.has(u.teamId) && !rosterEmails.has(u.email.toLowerCase())) report.removedFromRoster.push(u.email);
  }
  return report;
}

export function formatReport(report, { dryRun = false } = {}) {
  const lines = [
    dryRun ? "Dry run: nothing was written." : "Import finished.",
    `Teams: ${report.teams.created} created, ${report.teams.updated} updated, ${report.teams.unchanged} unchanged.`,
    `People: ${report.people.created} created, ${report.people.moved} moved, ${report.people.unchanged} unchanged, ${report.people.managersSet} reporting lines set.`,
  ];
  if (report.squadsToName.length) lines.push(`Teams awaiting a name (add the manager to the mapping): ${report.squadsToName.join("; ")}`);
  if (report.needPasswordReset.length) lines.push(`${report.needPasswordReset.length} people were created with a random password and need a reset before they sign in.`);
  if (report.removedFromRoster.length) lines.push(`In the instance but not in the roster (not deleted): ${report.removedFromRoster.join(", ")}`);
  for (const i of report.invalid) lines.push(`Skipped roster line ${i.line} (${i.email || "no email"}): ${i.reason}.`);
  for (const w of report.warnings) lines.push(`Warning: ${w}`);
  for (const e of report.errors) lines.push(`Error: ${e}`);
  return lines.join("\n");
}
