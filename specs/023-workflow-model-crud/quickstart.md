# Quickstart: Workflow Model & CRUD

This is a validation guide, not implementation — it proves the feature end-to-end once built. Full behavior details live in `data-model.md` and `spec.md`; this only sequences the calls.

## Prerequisites

- `pnpm install`
- A running Postgres (Testcontainers spins one up automatically for the test suite — no manual setup needed for automated validation)
- Migration applied: `workflow.workflows` table exists (via `pnpm db:migrate` once this feature's migration is generated)

## Scenario 1 — Create, then list, a workflow with steps

```ts
import { createWorkflow, listWorkflows } from "@/bcs/workflow-orchestration";

const actor = { id: userId, orgId: organizationId, teamId: null, role: "member" as const, email: "a@example.com" };

const workflow = await createWorkflow(db, actor, {
  name: "Weekly Digest",
  description: "Summarize then translate",
  steps: [
    { id: "summarize", promptName: "summarize-notes", dependsOn: [] },
    { id: "translate", promptName: "translate-es", dependsOn: ["summarize"] },
  ],
});
// workflow.organizationId === organizationId, workflow.userId === userId, workflow.projectId === null

const own = await listWorkflows(db, actor, { scope: "self" });
// own === [workflow]
```

**Expected outcome**: the workflow is stored with the submitted steps verbatim (including a step referencing a prompt name — `summarize-notes` — that doesn't need to exist yet), and is retrievable by its owner.

## Scenario 2 — Cross-organization project scoping is rejected

```ts
import { createWorkflow } from "@/bcs/workflow-orchestration";
import { WorkflowProjectOrganizationMismatchError } from "@/bcs/workflow-orchestration";

await createWorkflow(db, actor, {
  name: "Bad Scope",
  projectId: projectOwnedByAnotherOrg.id,
  steps: [],
});
// throws WorkflowProjectOrganizationMismatchError — no row created, no audit event written
```

## Scenario 3 — Update as owner vs. as a non-owner, non-admin user

```ts
import { updateWorkflow, NotAuthorizedError } from "@/bcs/workflow-orchestration";

// Owner updates their own workflow — succeeds
const updated = await updateWorkflow(db, actor, workflow.id, { description: "Now with more detail" });
// updated.name unchanged (omitted from the update), updated.description changed, updated.updatedAt advanced

// A different, non-admin user attempts the same update — rejected
const otherActor = { ...actor, id: otherUserId };
await updateWorkflow(db, otherActor, workflow.id, { name: "Hijacked" });
// throws NotAuthorizedError — stored workflow unchanged, no audit event written

// An org admin (not the owner) may still update it
const adminActor = { ...actor, id: adminUserId, role: "admin" as const };
await updateWorkflow(db, adminActor, workflow.id, { name: "Renamed by admin" });
// succeeds, audit event recorded
```

## Scenario 4 — Malformed steps are rejected on both create and update

```ts
import { createWorkflow, InvalidWorkflowStepsError } from "@/bcs/workflow-orchestration";

await createWorkflow(db, actor, {
  name: "Bad Steps",
  steps: [
    { id: "a", promptName: "x", dependsOn: [] },
    { id: "a", promptName: "y", dependsOn: [] }, // duplicate id
  ],
});
// throws InvalidWorkflowStepsError — no row created, no audit event written
```

**Expected outcome**: every rejection path (cross-org project, unauthorized update, malformed steps) leaves stored state untouched and writes zero audit events, matching SC-001/SC-002/SC-003/SC-005.
