# Research: Hierarchical Resolution Engine

## Decision: Consume Identity Access `getTeamChain` from its public contract

**Rationale**: `getTeamChain(db, organizationId, teamId)` already implements the self-first/root-last parent walk and org-scoped starting lookup that Governance resolution depends on. Reusing the export preserves bounded-context boundaries and avoids duplicating hierarchy traversal.

**Alternatives considered**: Querying `identity_access.teams` directly from Governance was rejected because it violates the bounded-context constitution. Reimplementing the parent walk in Governance was rejected because it would create a second source of truth for hierarchy behavior.

## Decision: Preserve legacy policy ordering with explicit inherited flags

**Rationale**: The Python resolver reads each team scope by priority descending, marks own-team/project policies as local, ancestor policies as inherited, sorts each layer by priority descending, then merges all policies by `(priority, is_inherited)` descending. The TypeScript resolver must expose the same observable `isInherited` presentation flag and inherited-wins-ties merged order.

**Alternatives considered**: Applying SQL-only global ordering was rejected unless it can prove identical stability for equal-priority/same-layer rows. The safer implementation keeps layer construction explicit and uses stable JavaScript sorting for the same visible rules.

## Decision: Preserve legacy objective grouping order rather than adding priority semantics

**Rationale**: Objectives have no priority. The Python resolver appends active objectives from each team in chain order, ordered by `created_at`, marks ancestor teams inherited, then appends user-personal objectives and optional project objectives to the local layer, each ordered by `created_at`. Flat all-objectives output returns inherited titles followed by local titles.

**Alternatives considered**: Sorting all objectives globally by `createdAt` was rejected because it would change legacy output. Recursively including child objectives was rejected because the Python resolver includes by scope/status only; parent links are metadata for this operation.

## Decision: Characterization tests live in TypeScript with checked-in legacy expected outputs

**Rationale**: The legacy Python services are checked into `legacy/backend/src/spechub_server/services/`. The current project test runner is Vitest/Testcontainers; adding a Python runtime harness would increase fragility. Tests can still be characterization tests by naming the source functions and encoding expected outputs from representative legacy fixtures before implementing TypeScript production code.

**Alternatives considered**: Running the Python services directly in Vitest was rejected because it would require provisioning the legacy Python dependency stack and database models in a TypeScript app test suite. Hand-testing without executable fixtures was rejected because the issue specifically requires automated characterization coverage.

## Decision: Add local count as repository aggregate helpers plus a named application service

**Rationale**: The UI needs a count of active local Governance records for a team or user node. The repository layer is the right place for Drizzle `count(*)` queries; the application service gives the UI a stable name without making the count a resolution primitive.

**Alternatives considered**: Reusing the full resolvers and counting local items was rejected because it would include project records for some calls and would do unnecessary team-chain work. Adding UI code was rejected because this feature is backend/domain contract only.

## Decision: No caching, memoization, or request-global resolver state

**Rationale**: The Governance contract explicitly requires read-your-writes consistency. Resolution must read current committed policy, objective, user, project, and team-chain state every call.

**Alternatives considered**: Caching the team chain or resolved sets was rejected because stale Governance results are silent correctness failures and the issue explicitly forbids caching.
