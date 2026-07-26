# Contract: Governance Resolution Application Services

No route, UI, or MCP surface is added by this feature. These are TypeScript bounded-context exports from `src/bcs/governance`.

```ts
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

type Db = PostgresJsDatabase<Record<string, never>>;

type EffectivePolicy = Policy & { isInherited: boolean };
type EffectiveObjective = Objective & { isInherited: boolean };

interface PolicyActor {
  organizationId: string;
  userId: string;
}

interface ObjectiveActor {
  organizationId: string;
  userId: string;
}

interface EffectivePolicySet {
  inherited: EffectivePolicy[];
  local: EffectivePolicy[];
}

interface EffectiveObjectiveSet {
  inherited: EffectiveObjective[];
  local: EffectiveObjective[];
}

interface LocalGovernanceCount {
  policyCount: number;
  objectiveCount: number;
  total: number;
}

function resolveEffectivePolicies(
  db: Db,
  actor: PolicyActor,
  userId: string,
  projectId?: string | null,
): Promise<EffectivePolicySet>;

function resolveAllPolicies(
  db: Db,
  actor: PolicyActor,
  userId: string,
  projectId?: string | null,
): Promise<EffectivePolicy[]>;

function resolveEffectiveObjectives(
  db: Db,
  actor: ObjectiveActor,
  userId: string,
  projectId?: string | null,
): Promise<EffectiveObjectiveSet>;

function resolveAllObjectives(
  db: Db,
  actor: ObjectiveActor,
  userId: string,
  projectId?: string | null,
): Promise<string[]>;

function countLocalPoliciesAndObjectives(
  db: Db,
  actor: PolicyActor | ObjectiveActor,
  node: { type: "team" | "user"; id: string },
): Promise<LocalGovernanceCount>;
```

## Behavioral Contract

- Resolvers return empty inherited/local lists when the target user is not found in the caller organization.
- Resolvers consume `getTeamChain(db, organizationId, user.teamId)` for team hierarchy traversal.
- Project-scoped records are included only when `projectId` is provided and belongs to the same organization by virtue of org-scoped Governance queries.
- Every call performs fresh database reads. Implementations must not retain resolver results, team-chain results, or count results in module state or request-global caches.
- Returned records never include rows from a different `organizationId`.
