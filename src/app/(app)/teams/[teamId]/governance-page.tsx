"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EffectiveObjective, EffectiveObjectiveSet, EffectivePolicy, EffectivePolicySet } from "@/bcs/governance";
import {
  createObjectiveAction,
  createPolicyAction,
  deleteObjectiveAction,
  deletePolicyAction,
  updateObjectiveAction,
  updatePolicyAction,
} from "./actions";
import { GovernanceView, type GovernanceTab } from "./governance-view";
import { ObjectiveDrawer, type ObjectiveFormValues } from "./objective-drawer";
import { PolicyDrawer, type PolicyFormValues } from "./policy-drawer";
import type { Scope, ScopeRow } from "./scope-tree-data";
import { chainRootFirst } from "./scope-tree-data";
import type { Team } from "@/bcs/identity-access";

type DrawerState =
  | { kind: "none" }
  | { kind: "policy"; mode: "create" | "edit"; policy?: EffectivePolicy }
  | { kind: "objective"; mode: "create" | "edit"; objective?: EffectiveObjective };

export interface GovernancePageProps {
  routeTeamId: string;
  initialTab: GovernanceTab;
  initialScope: Scope;
  teamsById: Map<string, Team>;
  rows: ScopeRow[];
  policies: EffectivePolicySet;
  objectives: EffectiveObjectiveSet;
}

export function GovernancePage({ routeTeamId, initialTab, initialScope, teamsById, rows, policies, objectives }: GovernancePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filterText, setFilterText] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>({ kind: "none" });

  function navigate(nextTab: GovernanceTab, nextScope: Scope) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextScope.kind === "person") {
      params.set("person", nextScope.userId);
    } else {
      params.delete("person");
    }
    const query = params.toString();
    router.push(`/teams/${routeTeamId}/${nextTab}${query ? `?${query}` : ""}`);
  }

  const breadcrumb = initialScope.teamId
    ? chainRootFirst(initialScope.teamId, teamsById)
        .map((team) => team.name)
        .concat(initialScope.kind === "person" ? [initialScope.label] : [])
        .join("   ›   ")
    : initialScope.label;

  return (
    <>
      <GovernanceView
        scope={initialScope}
        breadcrumb={breadcrumb}
        tab={initialTab}
        onTabChange={(tab) => navigate(tab, initialScope)}
        rows={rows}
        filterText={filterText}
        onFilterChange={setFilterText}
        onSelectScope={(scope) => navigate(initialTab, scope)}
        policies={policies}
        objectives={objectives}
        onOpenNewPolicy={() => setDrawer({ kind: "policy", mode: "create" })}
        onEditPolicy={(policy) => setDrawer({ kind: "policy", mode: "edit", policy })}
        onDeletePolicy={(policy) => {
          void deletePolicyAction({ routeTeamId, policyId: policy.id }).then(() => router.refresh());
        }}
        onOpenNewObjective={() => setDrawer({ kind: "objective", mode: "create" })}
        onEditObjective={(objective) => setDrawer({ kind: "objective", mode: "edit", objective })}
        onDeleteObjective={(objective) => {
          void deleteObjectiveAction({ routeTeamId, objectiveId: objective.id }).then(() => router.refresh());
        }}
      />

      {drawer.kind === "policy" && initialScope.kind === "team" ? (
        <PolicyDrawer
          scopeLabel={initialScope.label}
          mode={drawer.mode}
          initialValues={
            drawer.policy
              ? {
                  name: drawer.policy.name,
                  enforcementType: drawer.policy.enforcementType,
                  priority: drawer.policy.priority,
                  content: drawer.policy.content,
                }
              : undefined
          }
          onClose={() => setDrawer({ kind: "none" })}
          onSubmit={async (values: PolicyFormValues) => {
            const result =
              drawer.mode === "create"
                ? await createPolicyAction({ routeTeamId, teamId: initialScope.teamId, ...values })
                : await updatePolicyAction({ routeTeamId, policyId: drawer.policy!.id, ...values });
            if (result.ok) {
              setDrawer({ kind: "none" });
              router.refresh();
            }
            return result;
          }}
        />
      ) : null}

      {drawer.kind === "objective" ? (
        <ObjectiveDrawer
          scopeLabel={initialScope.label}
          scopeKind={initialScope.kind}
          mode={drawer.mode}
          initialValues={
            drawer.objective
              ? { title: drawer.objective.title, description: drawer.objective.description ?? "" }
              : undefined
          }
          onClose={() => setDrawer({ kind: "none" })}
          onSubmit={async (values: ObjectiveFormValues) => {
            const result =
              drawer.mode === "create"
                ? await createObjectiveAction({
                    routeTeamId,
                    teamId: initialScope.kind === "team" ? initialScope.teamId : null,
                    userId: initialScope.kind === "person" ? initialScope.userId : null,
                    ...values,
                  })
                : await updateObjectiveAction({ routeTeamId, objectiveId: drawer.objective!.id, ...values });
            if (result.ok) {
              setDrawer({ kind: "none" });
              router.refresh();
            }
            return result;
          }}
        />
      ) : null}
    </>
  );
}
