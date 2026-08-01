# Workflow Orchestration — Contract

**Owner:** Ben Anderson
**Status:** Draft

## Purpose

Owns `Workflow` — a named, ordered chain of skill (prompt) references, plus how each step's input maps from prior steps' outputs. Built entirely on top of Prompt Registry's `expand()` contract; has no template-rendering or governance logic of its own. **This context never executes a step or calls an LLM** — matching SkillCanon's architecture overall (`docs/architecture.md`). "Running" a workflow is a client-driven loop: the caller resolves one step, executes it itself against whatever model/agent it's using, reports back what it needs downstream steps to see, then asks for the next step's resolution — the same relationship `expand()`/`sh-run` already has with a single skill.

## Exposed APIs

| Endpoint / Method | Description | Consumers |
|---|---|---|
| `listWorkflows(orgId, userId)` | Workflows accessible to the user | Distribution (`sh-workflow-list`) |
| `startWorkflowRun(orgId, workflowId, userId)` | Creates a run, resolves step 1 via `expand()`, returns `{ runId, step }` | Distribution (`sh-workflow-run`) |
| `advanceWorkflowRun(orgId, runId, report)` | Records the caller's self-reported outcome (`status`, optional opaque `output`) for the just-resolved step, resolves and returns the next step (or `{ done: true }`) | Distribution (`sh-workflow-run`) |
| `listWorkflowRuns(orgId, workflowId)` / `getWorkflowRun(orgId, runId)` | Read-only: run(s) plus per-step resolved content and self-reported outcome. No `expand()` call, no state transition | Distribution (web UI's read-only run history page — never a `startWorkflowRun`/`advanceWorkflowRun` caller itself) |
| `createWorkflow`, `updateWorkflow` | Standard write operations | Distribution (route handlers) |

## Events Published

| Event | Payload summary | Consumers |
|---|---|---|
| `WorkflowCreated` | orgId, workflowId, actorUserId | Audit |
| `WorkflowRunCompleted` / `WorkflowRunFailed` | orgId, workflowId, runId, step count/status summary (self-reported, not a model output) | Audit, Distribution (usage metrics) |

## Events Consumed

| Event | From BC | What this BC does with it |
|---|---|---|
| none | — | Calls Prompt Registry synchronously per step; no reactive behavior |

## Data Contracts

```ts
interface WorkflowStepResolution {
  stepId: string; stepIndex: number; promptName: string; promptVersion: string;
  systemMessage: string; userMessage: string;
}
interface WorkflowStepReport {
  status: "success" | "error"; output?: string; error?: string;
}
```

Note what's deliberately absent: nothing here represents a model's actual response. `output` on `WorkflowStepReport` is caller-supplied and opaque to this context — used only to satisfy the next step's `inputMapping`, never inspected, validated, or treated as ground truth.

## Stability Guarantees

Step resolution order is strictly sequential. A step the caller reports as `"error"` never lets a downstream step's resolution silently use that step's output as if it succeeded — the next step's `inputMapping` resolves to `null`/an explicit error marker instead. This context does not itself determine success or failure; it only propagates what the caller reported.

## Breaking Change Policy

Changes to how a failed step affects downstream steps require a PDR — this is user-visible behavior IDEs will build around.
