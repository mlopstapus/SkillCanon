"use client";

import type { ReactNode } from "react";
import { AppState, Badge } from "@/shared/ui";
import { ProjectMetricsTrendChart, type ProjectMetricsTrendDay, type ProjectMetricsTrendSkill } from "./project-metrics-trend-chart";

export interface ProjectSkillRow {
  id: string;
  name: string;
  description: string;
  activeVersion: string | null;
  requirement: "required" | "optional" | null;
}

export interface ProjectMetricsTileData {
  totalInvocations: number;
  activeSkillCount: number;
  activeContributorCount: number;
  coverageLabel: string;
  hasRequiredSkills: boolean;
  allClear: boolean;
  gapMembers: Array<{ userId: string; name: string; missingSkillNames: string[] }>;
  trend: ProjectMetricsTrendDay[];
  trendSkills: ProjectMetricsTrendSkill[];
  bySkill: Array<{ promptId: string; name: string; requirement: "required" | "optional" | null; runCount: number; lastUsedAt: string }>;
  byMember: Array<{ userId: string | null; name: string; runCount: number; lastActiveAt: string }>;
}

export interface ProjectObjectiveRow {
  id: string;
  title: string;
  description: string | null;
}

export interface ProjectDetailData {
  id: string;
  name: string;
  description: string;
  teamLabel: string;
  leadLabel: string | null;
  memberCount: number;
  teamCount: number;
  repoCount: number;
  promptCount: number;
  members: Array<{ userId: string; name: string; role: string }>;
  collaboratorTeams: Array<{ id: string; name: string }>;
  addableTeams: Array<{ id: string; name: string }>;
  addableUsers: Array<{ id: string; name: string }>;
  repos: Array<{ id: string; name: string; url: string; branch: string }>;
  requiredPrompts: ProjectSkillRow[];
  optionalPrompts: ProjectSkillRow[];
  availablePrompts: ProjectSkillRow[];
  metrics: ProjectMetricsTileData;
  objectives: ProjectObjectiveRow[];
}

export type ProjectDetailTab = "members" | "prompts" | "repos" | "teams" | "metrics" | "governance";

export interface ProjectDetailViewProps {
  data: ProjectDetailData;
  activeTab: ProjectDetailTab;
  onTabChange: (tab: ProjectDetailTab) => void;
  onRemoveMember: (userId: string) => void;
  onRemoveTeam: (teamId: string) => void;
  onRemoveRepo: (repoId: string) => void;
  onSetRequirement: (skillId: string, requirement: "required" | "optional" | null) => void;
  onOpenAddTeam: () => void;
  onOpenAddMember: () => void;
  onOpenAddRepo: () => void;
  onOpenAddObjective: () => void;
  onEditObjective: (objective: ProjectObjectiveRow) => void;
  onRemoveObjective: (objectiveId: string) => void;
}

export function ProjectDetailView({
  data,
  activeTab,
  onTabChange,
  onRemoveMember,
  onRemoveTeam,
  onRemoveRepo,
  onSetRequirement,
  onOpenAddTeam,
  onOpenAddMember,
  onOpenAddRepo,
  onOpenAddObjective,
  onEditObjective,
  onRemoveObjective,
}: ProjectDetailViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-bg px-6.5 pt-4">
        <div className="mb-3.5 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-tile bg-gradient-to-br from-a to-a-2 font-mono text-[14px] font-bold text-a-fg shadow-glow">
            {data.name[0]?.toUpperCase()}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[20px] font-bold tracking-tight">{data.name}</h1>
              <span className="rounded-pill border border-border-2 px-2 py-0.5 font-mono text-[10.5px] text-dim">
                {data.teamLabel}
              </span>
            </div>
            {data.leadLabel ? (
              <div className="mt-0.5 font-mono text-[11px] text-faint">lead {data.leadLabel}</div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-0.5">
            {(
              [
                ["members", `Members (${data.memberCount})`],
                ["prompts", `Prompts (${data.promptCount})`],
                ["repos", `Repositories (${data.repoCount})`],
                ["teams", `Teams (${data.teamCount})`],
                ["governance", `Governance (${data.objectives.length})`],
                ["metrics", "Metrics"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key)}
                className={`px-3.5 py-2.5 text-[13.5px] font-semibold ${
                  activeTab === key ? "border-b-2 border-a text-text" : "border-b-2 border-transparent text-faint"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mb-2 flex gap-2">
            {activeTab === "teams" ? (
              <button type="button" onClick={onOpenAddTeam} className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[11px] text-dim">
                + add team
              </button>
            ) : null}
            {activeTab === "members" ? (
              <button type="button" onClick={onOpenAddMember} className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[11px] text-dim">
                + add member
              </button>
            ) : null}
            {activeTab === "repos" ? (
              <button type="button" onClick={onOpenAddRepo} className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[11px] text-dim">
                + add repository
              </button>
            ) : null}
            {activeTab === "governance" ? (
              <button type="button" onClick={onOpenAddObjective} className="rounded-control border border-border-2 px-2.5 py-1.5 font-mono text-[11px] text-dim">
                + objective
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto min-h-0 w-full max-w-[860px] flex-1 overflow-y-auto px-6.5 py-5.5">
        {activeTab === "teams" ? (
          <div className="flex flex-col gap-2.5">
            {data.collaboratorTeams.length === 0 ? (
              <div role="status" className="py-10 text-center text-[12.5px] text-dim">No teams associated with this project yet.</div>
            ) : null}
            {data.collaboratorTeams.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3">
                <span className="flex-1 text-[13.5px] font-semibold">{t.name}</span>
                <button type="button" onClick={() => onRemoveTeam(t.id)} className="rounded-control border border-border px-2 py-1 text-dim">
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "members" ? (
          <div className="flex flex-col gap-2.5">
            {data.members.length === 0 ? (
              <div role="status" className="py-10 text-center text-[12.5px] text-dim">No members yet.</div>
            ) : null}
            {data.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5">
                <div className="min-w-0 flex-1 text-[13px] font-semibold">{m.name}</div>
                <Badge variant={m.role === "lead" ? "accent" : "neutral"}>{m.role}</Badge>
                <button type="button" onClick={() => onRemoveMember(m.userId)} className="rounded-control border border-border px-2 py-1 text-dim">
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "repos" ? (
          <div className="flex flex-col gap-2.5">
            {data.repos.length === 0 ? (
              <div role="status" className="rounded-card border border-dashed border-border-2 py-9 text-center">
                <div className="mb-1.5 font-display text-[15px] font-semibold">No repositories linked</div>
                <button type="button" onClick={onOpenAddRepo} className="mt-2 rounded-control bg-a px-3.5 py-2 text-[12.5px] font-semibold text-a-fg">
                  Add repository
                </button>
              </div>
            ) : null}
            {data.repos.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">{r.name}</div>
                  <div className="font-mono text-[11px] text-faint">{r.url}</div>
                </div>
                <Badge>{r.branch}</Badge>
                <button type="button" onClick={() => onRemoveRepo(r.id)} className="rounded-control border border-border px-2 py-1 text-dim">
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "governance" ? (
          <div className="flex flex-col gap-2.5">
            {data.objectives.length === 0 ? (
              <AppState
                variant="empty"
                title="No objectives yet"
                description="This project has no objectives of its own yet. Add one to steer skill authors and reviewers on work scoped to this project."
                action={
                  <button
                    type="button"
                    onClick={onOpenAddObjective}
                    className="rounded-control bg-a px-4 py-2 text-[12.5px] font-semibold text-a-fg"
                  >
                    New objective
                  </button>
                }
              />
            ) : (
              data.objectives.map((o) => (
                <div
                  key={o.id}
                  className="flex items-start gap-3 rounded-card border border-border bg-surface px-3.5 py-3"
                >
                  <button
                    type="button"
                    onClick={() => onEditObjective(o)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="text-[13.5px] font-semibold">{o.title}</div>
                    {o.description ? <div className="mt-1 text-[12px] text-dim">{o.description}</div> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveObjective(o.id)}
                    aria-label={`Remove ${o.title}`}
                    className="rounded-control border border-border px-2 py-1 text-dim"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}

        {activeTab === "prompts" ? (
          <div className="flex flex-col gap-5.5">
            <PromptGroup label="Required" color="text-red" rows={data.requiredPrompts}>
              {(row) => (
                <>
                  <button type="button" onClick={() => onSetRequirement(row.id, "optional")} className="rounded-control border border-border-2 bg-surface-2 px-2 py-1 font-mono text-[10.5px] text-dim">
                    Make optional
                  </button>
                  <button type="button" onClick={() => onSetRequirement(row.id, null)} className="rounded-control border border-border px-2 py-1 text-dim">
                    ×
                  </button>
                </>
              )}
            </PromptGroup>
            <PromptGroup label="Optional" color="text-blue" rows={data.optionalPrompts}>
              {(row) => (
                <>
                  <button type="button" onClick={() => onSetRequirement(row.id, "required")} className="rounded-control border border-border-2 bg-surface-2 px-2 py-1 font-mono text-[10.5px] text-dim">
                    Make required
                  </button>
                  <button type="button" onClick={() => onSetRequirement(row.id, null)} className="rounded-control border border-border px-2 py-1 text-dim">
                    ×
                  </button>
                </>
              )}
            </PromptGroup>
            <PromptGroup label="Available" color="text-faint" rows={data.availablePrompts}>
              {(row) => (
                <>
                  <button type="button" onClick={() => onSetRequirement(row.id, "required")} className="rounded-control bg-red-soft px-2 py-1 font-mono text-[10.5px] text-red">
                    + Required
                  </button>
                  <button type="button" onClick={() => onSetRequirement(row.id, "optional")} className="rounded-control bg-blue-soft px-2 py-1 font-mono text-[10.5px] text-blue">
                    + Optional
                  </button>
                </>
              )}
            </PromptGroup>
          </div>
        ) : null}

        {activeTab === "metrics" ? (
          <div className="flex flex-col gap-5.5">
            <div className="grid grid-cols-4 gap-2.5">
              <MetricTile label="Total invocations" value={String(data.metrics.totalInvocations)} />
              <MetricTile label="Active skills" value={String(data.metrics.activeSkillCount)} />
              <MetricTile label="Active contributors" value={String(data.metrics.activeContributorCount)} />
              <MetricTile label="Required-skill coverage" value={data.metrics.coverageLabel} />
            </div>

            {data.metrics.hasRequiredSkills && data.metrics.gapMembers.length > 0 ? (
              <div className="rounded-card border border-red/30 bg-red-soft px-4 py-3.5">
                <div className="mb-2.5 font-display text-[13.5px] font-semibold">Contributors not using required skills</div>
                <div className="flex flex-col gap-1.5">
                  {data.metrics.gapMembers.map((m) => (
                    <div key={m.userId} className="text-[12.5px] text-dim">
                      <span className="font-semibold text-text">{m.name}</span> — missing{" "}
                      <span className="text-red">{m.missingSkillNames.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {data.metrics.hasRequiredSkills && data.metrics.allClear ? (
              <div className="rounded-card border border-border bg-surface px-4 py-3.5 text-[12.5px]">
                Every contributor is current on required skills.
              </div>
            ) : null}

            <div>
              <span className="mb-3 block font-display text-[14px] font-semibold">Invocations, last 14 days</span>
              <ProjectMetricsTrendChart trend={data.metrics.trend} skills={data.metrics.trendSkills} />
            </div>

            <div>
              <span className="mb-3 block font-display text-[14px] font-semibold">Usage by skill</span>
              {data.metrics.bySkill.length === 0 ? (
                <div role="status" className="rounded-card border border-border py-5 text-center text-[12.5px] text-dim">
                  No skills curated for this project yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {data.metrics.bySkill.map((s) => (
                    <div key={s.promptId} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5">
                      <span className="flex-1 font-mono text-[12.5px]">{s.name}</span>
                      <span className="font-mono text-[11.5px] text-dim">{s.runCount} runs</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span className="mb-3 block font-display text-[14px] font-semibold">Usage by member</span>
              {data.metrics.byMember.length === 0 ? (
                <div role="status" className="rounded-card border border-border py-5 text-center text-[12.5px] text-dim">
                  No usage recorded for this project yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {data.metrics.byMember.map((m) => (
                    <div key={m.userId ?? "no-user"} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5">
                      <span className="flex-1 text-[13px] font-semibold">{m.name}</span>
                      <span className="font-mono text-[11.5px] text-dim">{m.runCount} runs</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3.5">
      <div className="mb-2 font-mono text-[10px] tracking-[0.08em] text-faint uppercase">{label}</div>
      <div className="font-display text-[22px] font-bold">{value}</div>
    </div>
  );
}

function PromptGroup({
  label,
  color,
  rows,
  children,
}: {
  label: string;
  color: string;
  rows: ProjectSkillRow[];
  children: (row: ProjectSkillRow) => ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`font-mono text-[10px] tracking-[0.1em] uppercase ${color}`}>{label}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {rows.length === 0 ? (
        <div role="status" className="py-1 text-[12px] text-faint">No {label.toLowerCase()} prompts yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13px] font-semibold">{row.name}</div>
                <div className="text-[12px] text-dim">{row.description}</div>
              </div>
              {row.activeVersion ? <Badge variant="accent">{row.activeVersion}</Badge> : null}
              {children(row)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
