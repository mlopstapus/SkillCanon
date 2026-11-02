export interface RosterRow {
  line: number;
  name: string;
  email: string;
  title: string;
  department: string;
  manager_email: string;
}
export interface PlanTeam {
  slug: string;
  name: string;
  ownerEmail: string | null;
  parentSlug: string | null;
  squad: boolean;
}
export interface PlanMember {
  email: string;
  name: string;
  managerEmail: string | null;
  teamSlug: string;
}
export interface Plan {
  teams: PlanTeam[];
  members: PlanMember[];
  squads: { email: string; name: string }[];
  invalid: { line: number; email: string; reason: string }[];
  warnings: string[];
}
export interface ImportReport {
  teams: { created: number; updated: number; unchanged: number };
  people: { created: number; moved: number; unchanged: number };
  squadsToName: string[];
  invalid: Plan["invalid"];
  warnings: string[];
  removedFromRoster: string[];
  needPasswordReset: string[];
  errors: string[];
}
export type RestCall = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ ok: boolean; status: number; json: Record<string, unknown> & { items?: unknown[]; total?: number } }>;
export function slugify(value: string): string;
export function parseCsv(text: string): string[][];
export function parseRoster(csvText: string): RosterRow[];
export function buildPlan(rows: RosterRow[], mapping: Record<string, string>): Plan;
export function applyPlan(plan: Plan, options: { call: RestCall; rootTeamSlug?: string; dryRun?: boolean }): Promise<ImportReport>;
export function formatReport(report: ImportReport, options?: { dryRun?: boolean }): string;
