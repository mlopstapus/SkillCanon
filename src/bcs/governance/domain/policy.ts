export const POLICY_ENFORCEMENT_TYPES = ["prepend", "append", "inject", "validate"] as const;

export type PolicyEnforcementType = (typeof POLICY_ENFORCEMENT_TYPES)[number];

export interface Policy {
  id: string;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  name: string;
  description: string | null;
  enforcementType: PolicyEnforcementType;
  content: string;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  isInherited: false;
}

export type EffectivePolicy = Omit<Policy, "isInherited"> & {
  isInherited: boolean;
};

export interface EffectivePolicySet {
  inherited: EffectivePolicy[];
  local: EffectivePolicy[];
}

export interface LocalGovernanceCount {
  policyCount: number;
  objectiveCount: number;
  total: number;
}

export interface PolicyActor {
  organizationId: string;
  userId: string;
}

export interface PolicyScopeVerifier {
  teamBelongsToOrganization?: (organizationId: string, teamId: string) => Promise<boolean>;
  projectBelongsToOrganization?: (organizationId: string, projectId: string) => Promise<boolean>;
}

export interface CreatePolicyParams {
  teamId?: string | null;
  projectId?: string | null;
  name: string;
  description?: string | null;
  enforcementType: PolicyEnforcementType;
  content: string;
  priority?: number;
}

export interface UpdatePolicyFields {
  name?: string;
  description?: string | null;
  enforcementType?: PolicyEnforcementType;
  content?: string;
  priority?: number;
}

export class InvalidPolicyScopeError extends Error {
  constructor() {
    super("A policy must be scoped to exactly one team or project.");
    this.name = "InvalidPolicyScopeError";
  }
}

export class PolicyScopeNotFoundError extends Error {
  constructor() {
    super("The supplied policy scope does not belong to the caller's organization.");
    this.name = "PolicyScopeNotFoundError";
  }
}

export class PolicyNotFoundError extends Error {
  constructor(policyId: string) {
    super(`No policy found with id "${policyId}" in the caller's organization.`);
    this.name = "PolicyNotFoundError";
  }
}
