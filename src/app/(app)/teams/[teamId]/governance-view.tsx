"use client";

import type { EffectiveObjective, EffectiveObjectiveSet, PolicyEnforcementType } from "@/bcs/governance";
import type { EffectivePolicy, EffectivePolicySet } from "@/bcs/governance";
import { AppState, Badge } from "@/shared/ui";
import { ScopeTree } from "./scope-tree";
import type { Scope, ScopeRow } from "./scope-tree-data";

export type GovernanceTab = "policies" | "objectives";

const MODE_VARIANT: Record<PolicyEnforcementType, "blue" | "accent" | "violet" | "red"> = {
  prepend: "blue",
  append: "accent",
  inject: "violet",
  validate: "red",
};

export interface GovernanceViewProps {
  scope: Scope;
  breadcrumb: string;
  tab: GovernanceTab;
  onTabChange: (tab: GovernanceTab) => void;
  rows: ScopeRow[];
  filterText: string;
  onFilterChange: (text: string) => void;
  onSelectScope: (scope: Scope) => void;
  policies: EffectivePolicySet;
  objectives: EffectiveObjectiveSet;
  onOpenNewPolicy: () => void;
  onEditPolicy: (policy: EffectivePolicy) => void;
  onDeletePolicy: (policy: EffectivePolicy) => void;
  onOpenNewObjective: () => void;
  onEditObjective: (objective: EffectiveObjective) => void;
  onDeleteObjective: (objective: EffectiveObjective) => void;
}

function PolicyCard({
  policy,
  local,
  onEdit,
  onDelete,
}: {
  policy: EffectivePolicy;
  local: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-card border border-border-2 bg-surface p-3.5">
      {local ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-a" /> : null}
      <div className="flex items-center gap-3">
        <span className="w-8 flex-none font-mono text-[11px] text-faint">#{policy.priority}</span>
        <Badge variant={MODE_VARIANT[policy.enforcementType]}>{policy.enforcementType}</Badge>
        <span className="font-mono text-[13px] font-medium text-text">{policy.name}</span>
        {local ? (
          <span className="ml-auto flex items-center gap-1.5">
            {onEdit ? (
              <button type="button" onClick={onEdit} aria-label={`Edit ${policy.name}`} className="rounded-control border border-border px-2 py-1 text-[11px] text-dim hover:text-text">
                Edit
              </button>
            ) : null}
            {onDelete ? (
              <button type="button" onClick={onDelete} aria-label={`Delete ${policy.name}`} className="rounded-control border border-border px-2 py-1 text-[11px] text-dim hover:text-red">
                Delete
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      <p className="mt-2 pl-11 text-[12.5px] leading-[1.5] text-dim">{policy.content}</p>
    </div>
  );
}

function ObjectiveCard({
  objective,
  local,
  onEdit,
  onDelete,
}: {
  objective: EffectiveObjective;
  local: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="relative flex items-start gap-3 overflow-hidden rounded-card border border-border-2 bg-surface p-3.5">
      {local ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-a" /> : null}
      <span aria-hidden className="mt-0.5 h-6 w-6 flex-none rounded-control border border-border-2 bg-surface-2" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] font-medium text-text">{objective.title}</span>
          {local ? (
            <span className="ml-auto flex items-center gap-1.5">
              {onEdit ? (
                <button type="button" onClick={onEdit} aria-label={`Edit ${objective.title}`} className="rounded-control border border-border px-2 py-1 text-[11px] text-dim hover:text-text">
                  Edit
                </button>
              ) : null}
              {onDelete ? (
                <button type="button" onClick={onDelete} aria-label={`Delete ${objective.title}`} className="rounded-control border border-border px-2 py-1 text-[11px] text-dim hover:text-red">
                  Delete
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-dim">{objective.description ?? ""}</p>
      </div>
    </div>
  );
}

export function GovernanceView(props: GovernanceViewProps) {
  const {
    scope,
    breadcrumb,
    tab,
    onTabChange,
    rows,
    filterText,
    onFilterChange,
    onSelectScope,
    policies,
    objectives,
    onOpenNewPolicy,
    onEditPolicy,
    onDeletePolicy,
    onOpenNewObjective,
    onEditObjective,
    onDeleteObjective,
  } = props;

  const isPersonScope = scope.kind === "person";

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[288px_minmax(0,1fr)]">
      <ScopeTree rows={rows} selectedScope={scope} filterText={filterText} onFilterChange={onFilterChange} onSelect={onSelectScope} />

      <main className="flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-border px-6.5 pt-3.5">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[.12em] text-faint">
                Effective governance
              </div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-8.5 w-8.5 flex-none place-items-center rounded-control bg-a font-mono text-[14px] font-semibold text-a-fg">
                  {scope.label[0]?.toUpperCase()}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[21px] font-bold">{scope.label}</span>
                    <span className="rounded-pill border border-border-2 px-2 py-0.5 font-mono text-[10.5px] text-dim">
                      {scope.kind === "team" ? "team" : "person"}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-faint">{breadcrumb}</div>
                </div>
              </div>
            </div>
            {tab === "policies" && isPersonScope ? null : (
              <button
                type="button"
                onClick={tab === "policies" ? onOpenNewPolicy : onOpenNewObjective}
                className="flex flex-none items-center gap-1.5 rounded-cta bg-a px-3.5 py-2 text-[13px] font-semibold text-a-fg"
              >
                New {tab === "policies" ? "policy" : "objective"}
              </button>
            )}
          </div>
          {tab === "policies" && isPersonScope ? (
            <p className="mb-2 mt-2 text-[11.5px] text-faint">
              Policies can only be created for a team, not an individual person.
            </p>
          ) : null}
          <div className="mt-3.5 flex gap-0.5 border-b border-border">
            <button
              type="button"
              onClick={() => onTabChange("policies")}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${
                tab === "policies" ? "border-b-2 border-a text-text" : "border-b-2 border-transparent text-faint"
              }`}
            >
              Policies
              <span className="rounded-control border border-border bg-surface px-1.5 py-px font-mono text-[10.5px] text-faint">
                {policies.inherited.length + policies.local.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange("objectives")}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${
                tab === "objectives" ? "border-b-2 border-a text-text" : "border-b-2 border-transparent text-faint"
              }`}
            >
              Objectives
              <span className="rounded-control border border-border bg-surface px-1.5 py-px font-mono text-[10.5px] text-faint">
                {objectives.inherited.length + objectives.local.length}
              </span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6.5 py-5">
          {tab === "policies" ? (
            <div>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="font-display text-[13.5px] font-semibold text-dim">Inherited</span>
                <span className="rounded-control border border-border px-1.5 py-px font-mono text-[10.5px] text-faint">immutable</span>
                <span className="ml-auto font-mono text-[11px] text-faint">{policies.inherited.length} from parents</span>
              </div>
              <div className="mb-7.5 flex flex-col gap-2.5">
                {policies.inherited.map((policy) => (
                  <PolicyCard key={policy.id} policy={policy} local={false} />
                ))}
              </div>

              <div className="mb-3 flex items-center gap-2.5">
                <span className="font-display text-[13.5px] font-semibold">
                  Local <span className="font-medium text-dim">· at {scope.label}</span>
                </span>
                <span className="rounded-control bg-a-soft px-1.5 py-px font-mono text-[10.5px] text-a">editable</span>
              </div>
              {policies.local.length === 0 ? (
                <AppState
                  variant="empty"
                  title={`No local policies at ${scope.label}`}
                  description={
                    isPersonScope
                      ? `${scope.label} inherits every policy above and applies them unchanged.`
                      : `${scope.label} inherits every policy above and applies them unchanged. Add a scoped policy here to layer on extra rules — they cascade to everything below.`
                  }
                  action={
                    isPersonScope ? undefined : (
                      <button
                        type="button"
                        onClick={onOpenNewPolicy}
                        className="flex items-center gap-1.5 rounded-cta bg-a px-3.5 py-2 text-[13px] font-semibold text-a-fg"
                      >
                        New policy
                      </button>
                    )
                  }
                />
              ) : (
                <div className="flex flex-col gap-2.5">
                  {policies.local.map((policy) => (
                    <PolicyCard
                      key={policy.id}
                      policy={policy}
                      local
                      onEdit={() => onEditPolicy(policy)}
                      onDelete={() => onDeletePolicy(policy)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="font-display text-[13.5px] font-semibold text-dim">Inherited</span>
                <span className="rounded-control border border-border px-1.5 py-px font-mono text-[10.5px] text-faint">immutable</span>
                <span className="ml-auto font-mono text-[11px] text-faint">{objectives.inherited.length} from parents</span>
              </div>
              <div className="mb-7.5 flex flex-col gap-2.5">
                {objectives.inherited.map((objective) => (
                  <ObjectiveCard key={objective.id} objective={objective} local={false} />
                ))}
              </div>

              <div className="mb-3 flex items-center gap-2.5">
                <span className="font-display text-[13.5px] font-semibold">
                  Local <span className="font-medium text-dim">· at {scope.label}</span>
                </span>
                <span className="rounded-control bg-a-soft px-1.5 py-px font-mono text-[10.5px] text-a">editable</span>
              </div>
              {objectives.local.length === 0 ? (
                <AppState
                  variant="empty"
                  title={`No local objectives at ${scope.label}`}
                  description={`Objectives surface alongside every expansion as guidance. ${scope.label} currently relies on inherited objectives only.`}
                  action={
                    <button
                      type="button"
                      onClick={onOpenNewObjective}
                      className="flex items-center gap-1.5 rounded-cta bg-a px-3.5 py-2 text-[13px] font-semibold text-a-fg"
                    >
                      New objective
                    </button>
                  }
                />
              ) : (
                <div className="flex flex-col gap-2.5">
                  {objectives.local.map((objective) => (
                    <ObjectiveCard
                      key={objective.id}
                      objective={objective}
                      local
                      onEdit={() => onEditObjective(objective)}
                      onDelete={() => onDeleteObjective(objective)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
