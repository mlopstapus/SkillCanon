import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EffectiveObjective, EffectiveObjectiveSet, EffectivePolicy, EffectivePolicySet } from "@/bcs/governance";
import { GovernanceView, type GovernanceViewProps } from "./governance-view";
import type { Scope } from "./scope-tree-data";

const teamScope: Scope = { kind: "team", teamId: "team-1", label: "Platform" };
const personScope: Scope = { kind: "person", userId: "user-1", teamId: "team-1", label: "alice" };

function makePolicy(overrides: Partial<EffectivePolicy> & Pick<EffectivePolicy, "id" | "name">): EffectivePolicy {
  return {
    organizationId: "org-1",
    teamId: "team-1",
    description: null,
    enforcementType: "prepend",
    content: "Do the thing.",
    priority: 10,
    isActive: true,
    createdAt: new Date("2026-01-01"),
    isInherited: false,
    ...overrides,
  };
}

function makeObjective(overrides: Partial<EffectiveObjective> & Pick<EffectiveObjective, "id" | "title">): EffectiveObjective {
  return {
    organizationId: "org-1",
    teamId: "team-1",
    projectId: null,
    userId: null,
    description: "Ship the thing.",
    parentObjectiveId: null,
    isInherited: false,
    status: "active",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function baseProps(overrides: Partial<GovernanceViewProps> = {}): GovernanceViewProps {
  const emptyPolicies: EffectivePolicySet = { inherited: [], local: [] };
  const emptyObjectives: EffectiveObjectiveSet = { inherited: [], local: [] };
  return {
    scope: teamScope,
    breadcrumb: "Acme  ›  Platform",
    tab: "policies",
    onTabChange: () => {},
    rows: [],
    filterText: "",
    onFilterChange: () => {},
    onSelectScope: () => {},
    policies: emptyPolicies,
    objectives: emptyObjectives,
    onOpenNewPolicy: () => {},
    onEditPolicy: () => {},
    onDeletePolicy: () => {},
    onOpenNewObjective: () => {},
    onEditObjective: () => {},
    onDeleteObjective: () => {},
    ...overrides,
  };
}

describe("GovernanceView", () => {
  it("shows inherited policies attributed to their source and separates them from local policies", () => {
    const policies: EffectivePolicySet = {
      inherited: [makePolicy({ id: "p-inherited", name: "org-wide-rule", isInherited: true, teamId: "team-root" })],
      local: [makePolicy({ id: "p-local", name: "platform-rule", isInherited: false })],
    };
    const html = renderToStaticMarkup(<GovernanceView {...baseProps({ policies })} />);

    expect(html).toContain("org-wide-rule");
    expect(html).toContain("platform-rule");
    expect(html).toContain("Inherited");
    expect(html).toContain("Local");
  });

  it("shows the local-policies empty state with a call to action when there are none", () => {
    const html = renderToStaticMarkup(<GovernanceView {...baseProps()} />);
    expect(html).toContain("No local policies at Platform");
    expect(html).toContain("New policy");
  });

  it("switches to the objectives tab and renders objective counts", () => {
    const objectives: EffectiveObjectiveSet = {
      inherited: [makeObjective({ id: "o-1", title: "grow-revenue" })],
      local: [],
    };
    const html = renderToStaticMarkup(<GovernanceView {...baseProps({ tab: "objectives", objectives })} />);
    expect(html).toContain("grow-revenue");
  });

  it("does not offer 'New policy' when the selected scope is a person", () => {
    const html = renderToStaticMarkup(<GovernanceView {...baseProps({ scope: personScope })} />);
    expect(html).not.toContain(">New policy<");
    expect(html).toContain("Policies can only be created for a team");
  });

  it("does offer 'New objective' when the selected scope is a person", () => {
    const html = renderToStaticMarkup(
      <GovernanceView {...baseProps({ scope: personScope, tab: "objectives" })} />,
    );
    expect(html).toContain("New objective");
  });

  it("shows edit/delete controls only on local items, not inherited ones", () => {
    const policies: EffectivePolicySet = {
      inherited: [makePolicy({ id: "p-inherited", name: "inherited-rule", isInherited: true })],
      local: [makePolicy({ id: "p-local", name: "local-rule", isInherited: false })],
    };
    const html = renderToStaticMarkup(<GovernanceView {...baseProps({ policies })} />);
    expect(html).toContain('aria-label="Edit local-rule"');
    expect(html).not.toContain('aria-label="Edit inherited-rule"');
  });
});
