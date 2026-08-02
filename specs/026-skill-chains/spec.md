# Feature Specification: Skill Chains

**Feature Branch**: `026-skill-chains`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "backlog/006-prompt-registry/009-skill-chains.md" — a skill version that is an ordered list of steps instead of a template ("chain version"), plus a client-driven, step-by-step run capability that lets a caller (an IDE agent, another tool, the web UI) walk those steps one at a time, resolving each step's governed content without ever executing it or seeing what a model produced. Per [PDR-017], this replaces the previously-planned standalone Workflow Orchestration capability — a chain is a skill, not a separate concept, and inherits the same ownership, versioning, sharing, and project-assignment capabilities every other skill already has.

## Clarifications

### Session 2026-08-01

- Q: Who is authorized to start a run of a chain skill? → A: Anyone who can already access the skill (owner, own team, direct subscription, or membership in a project that subscribes to it) — the same accessible-skill set used everywhere else for running a skill, no new authorization concept. (Narrower than the platform's full *discoverable* set — access gained purely through a project *assignment* rather than a subscription follows the same rule ordinary skill invocation already follows, not a chain-specific carve-out.)
- Q: Who may advance (report a step outcome for) an in-progress run, including resuming one that's been sitting idle? → A: Anyone who can access the skill — the same rule as starting a run; a run is not bound to whichever specific user started it.
- Q: If two advance calls race for the same run (e.g. a network retry duplicates a report for the step currently in progress), what happens to the second one? → A: Rejected as a conflict — the run has already moved past that step index, so no double side effects or silent overwrite occur.
- Q: What happens when a caller calls advance on a run that's already finished (completed, failed, or abandoned)? → A: Rejected with a clear "this run has already finished" error, never silently treated as a no-op success.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author and run a multi-step chain (Priority: P1)

A user composes a chain by listing, in order, the existing skills it should invoke and how each step's input relates to earlier steps' results. A caller (an IDE agent or similar tool) starts a run of that chain, receives the first step's fully governed content, executes it on its own, reports back what happened, and receives the next step in return — repeating until the chain is done.

**Why this priority**: This is the entire reason the feature exists — without it, there is no way to compose multiple skills into a runtime sequence at all.

**Independent Test**: Publish a three-step chain (step 2 depending on step 1's result), start a run, report success for each step in turn with a sample result, and confirm each returned step's content is correct and the run finishes marked complete.

**Acceptance Scenarios**:

1. **Given** a published chain version with steps A → B → C (B and C each depending on A's result), **When** a caller starts a run, **Then** the caller receives step A's content, resolved exactly as if A were run as a standalone skill (including any applicable governance).
2. **Given** a run currently positioned at step A, **When** the caller reports step A succeeded and supplies a result, **Then** the caller receives step B's content, with A's result available wherever B's declared dependency on A calls for it.
3. **Given** a run at its final step, **When** the caller reports that step's outcome, **Then** the caller is told the run is finished, and the run's overall status reflects that every step succeeded.
4. **Given** a chain version with zero steps, **When** a caller starts a run, **Then** the run is immediately finished with nothing to execute.

---

### User Story 2 - A failed step never contaminates later steps (Priority: P1)

When the caller reports that a step failed, any later step that depends on that step's result must be able to tell, unambiguously, that no real result exists — never receive fabricated or leftover data that could be mistaken for a real, successful result.

**Why this priority**: Silent data corruption in a multi-step automated sequence is worse than an outright failure — a caller (or downstream skill) that treats a failure marker as real data could take a wrong, hard-to-diagnose action. This guarantee has to hold from day one, not be patched in later.

**Independent Test**: Publish a chain where step 3 depends on step 2's result, report step 2 as failed, and confirm step 3's content shows an explicit "unavailable" indicator in place of step 2's result rather than any prior or default value.

**Acceptance Scenarios**:

1. **Given** a run at step 2 of a chain where step 3 depends on step 2, **When** the caller reports step 2 as failed (with no result), **Then** step 3's content contains an explicit marker indicating step 2's result is unavailable, wherever that dependency would otherwise have been filled in.
2. **Given** a chain where every step through the second-to-last was reported successful and the final step was reported as failed, **When** the run reaches its end, **Then** the run's overall status reflects failure, even though earlier steps succeeded.
3. **Given** an in-progress run, **When** the caller explicitly ends the run instead of continuing to report step outcomes, **Then** the run's status reflects that it was deliberately ended, distinct from either completing or failing on its own.

---

### User Story 3 - Chains inherit sharing and reuse with zero extra setup (Priority: P2)

A chain published by one team can be shared with another team or user using the exact same mechanism already used to share any other skill — no separate "share a chain" capability to learn or build.

**Why this priority**: This is the core promise of treating a chain as "just a skill" rather than a separate concept — proving it removes real, otherwise-duplicated work, but the platform is still useful without it (a chain's own owning team can run it without ever sharing it).

**Independent Test**: Publish a chain version owned by one team, share it with a second team using the platform's existing skill-sharing mechanism, and confirm a member of the second team can start and complete a run of it without any additional configuration.

**Acceptance Scenarios**:

1. **Given** a chain version owned by Team A, **When** Team A shares it with Team B using the platform's existing skill-sharing capability, **Then** a member of Team B can start a run of that chain.
2. **Given** a chain version, **When** a user creates an independent copy of it (a fork) under their own ownership, **Then** the copy can be run and later republished with different steps, without affecting the original chain.
3. **Given** a chain version assigned to a project the same way any other skill can be, **When** a project member looks at what's available to that project, **Then** the chain appears alongside ordinary skills.

---

### User Story 4 - Review a run's full history after the fact (Priority: P3)

Anyone with access to a chain can look back at any of its past runs — what was sent for each step and what the caller reported happened — without needing to have been the one driving that run live.

**Why this priority**: Valuable for debugging and auditing, but the platform still delivers its core value (composing and running chains) without a history view; this is an after-the-fact convenience, not something a live run depends on.

**Independent Test**: Complete a run, then — using a separate read-only request unrelated to the run itself — retrieve that run's full step-by-step record and confirm it matches exactly what was sent and reported during the live run.

**Acceptance Scenarios**:

1. **Given** a completed run, **When** its history is requested, **Then** every step's resolved content and the caller's self-reported outcome for that step are returned, in order.
2. **Given** a still-in-progress run, **When** its history is requested, **Then** the steps resolved so far are returned along with the run's current status — the request itself does not advance or otherwise change the run.
3. **Given** a run belonging to a different organization, **When** a user requests it (directly or via its parent chain's run list), **Then** access is denied.

---

### Edge Cases

- What happens when a chain step's declared dependency refers to a step that doesn't exist, refers to itself, or refers to a step that comes later in the sequence? The run is rejected outright before it starts — no run record is ever created for an invalid chain.
- What happens when the system itself cannot produce a step's content — for example, the skill a step invokes was removed or deprecated after the chain was published? The run fails immediately with a reason that clearly indicates the system couldn't produce content, distinct from a caller reporting that a step failed.
- What happens when a caller starts a run and then simply stops calling back (never reports the current step's outcome, never explicitly ends the run)? The run stays open indefinitely; nothing time-based closes it automatically. Any org member with access to the chain — not necessarily the one who started it — can resume it later, or explicitly end it at any time.
- What happens if a caller reports a wildly oversized result for a step? The reported result is capped at a reasonable size; the system does not attempt to interpret or validate its contents either way.
- What happens if two different steps in the same chain declare the same step identifier? This is rejected as an invalid chain, the same as any other structurally invalid dependency declaration.
- What happens if two advance calls race for the same run (e.g. a network retry duplicates a report for the step currently in progress)? The run has already moved past that step index by the time the second call is processed, so it is rejected outright as a conflict — never silently overwritten or double-processed.
- What happens if a caller calls advance (or explicitly ends) a run that already finished (completed, failed, or abandoned)? The call is rejected with a clear "this run has already finished" error rather than silently succeeding as if more work remained. (Starting a *new* run is always a separate, freshly created run — there is no "restart" operation on an existing run id to guard against here.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a skill version to be published as either a template (existing behavior, unchanged) or as an ordered sequence of steps (a "chain version"), with exactly one of the two per version — a version specifying both, or neither, MUST be rejected.
- **FR-002**: System MUST let each step in a chain version declare a step identifier unique within that chain, which existing skill it invokes (optionally pinned to a specific version of that skill), and which other step(s) in the same chain it depends on.
- **FR-003**: A published chain version MUST be immutable — changing which steps a chain runs, or their order or dependencies, requires publishing a new version, exactly like changing a template version's content does.
- **FR-004**: A chain version MUST support the same ownership, version history, sharing (direct grant and forking-a-copy), and project-assignment capabilities that every other skill version already supports, with no additional feature-specific setup.
- **FR-005**: System MUST let any caller who already has access to a chain skill (through ownership, team ownership, or subscription — including subscription inherited via membership in a project — the same accessible-skill set used for running any other skill) start a run of it, resolving and returning the first step's fully governed content. No separate, chain-specific authorization concept is introduced.
- **FR-006**: Before starting a run, the system MUST validate that no step's declared dependency references a nonexistent step, the step's own identifier, or a step that comes at the same or a later position in the sequence — an invalid chain MUST be rejected with no run record created.
- **FR-007**: System MUST let any caller with access to the chain — not necessarily the one who started the run — report whether the run's currently-pending step succeeded or failed and optionally supply an opaque result value, then receive either the next step's content or an indication that the run is finished.
- **FR-007a**: A run's currently-pending step MUST be advanced by at most one accepted report — a second, racing, or duplicate report for a step the run has already moved past MUST be rejected as a conflict, never silently overwritten or double-applied.
- **FR-007b**: Attempting to advance or explicitly end a run that has already reached a terminal state (completed, failed, or abandoned) MUST be rejected with a clear error indicating the run has already finished, never treated as a silent no-op success.
- **FR-008**: When a step is reported as failed, any later step whose declared dependency points at that step MUST receive an explicit "result unavailable" indicator in place of that dependency — never fabricated, stale, or otherwise misleading data.
- **FR-009**: A run MUST be marked complete once its final step has been reported successful, MUST be marked failed once any step has been reported failed and the run reaches its end, and MUST support being explicitly ended early by the caller at any point, marked distinctly from either of those two outcomes.
- **FR-010**: A chain version with zero steps MUST complete a run immediately, with no step ever resolved or returned.
- **FR-011**: If the system itself is unable to produce a step's content (for example, the skill invoked by that step is no longer available), the run MUST fail immediately with a reason that is clearly and mechanically distinguishable from a caller-reported step failure — never surfaced to the caller as an ordinary "advance" response, and never recorded as though the caller had self-reported that outcome.
- **FR-012**: System MUST persist a complete history of every run — every step's resolved content and the caller's self-reported outcome — retrievable after the fact by anyone with access to the run.
- **FR-013**: Retrieving a run or its history MUST be a read-only operation — it MUST NOT resolve any new step, change the run's status, or otherwise alter the run's state.
- **FR-014**: A caller-supplied step result MUST be capped at a reasonable size (default 64 KB) and MUST be treated as opaque data by the system — never interpreted, parsed, or validated against any schema. A result exceeding the cap MUST be rejected outright, never silently truncated, so a caller always knows definitively whether its full result was recorded.
- **FR-015**: The system MUST never store or return anything resembling a model's actual generated output for a step — only the content that was sent for that step and what the caller self-reported about it.
- **FR-016**: Access to a run and its history MUST be restricted to members of the organization that owns it; any attempt to access another organization's run or run history MUST be denied.

### Key Entities

- **Chain Version**: A version of a skill whose content is an ordered list of steps rather than a template. Otherwise participates in ownership, versioning, sharing, and project assignment identically to a template version.
- **Chain Step**: One entry within a chain version — identifies which skill it invokes (and optionally which version of that skill) and which earlier step(s) in the same chain its input depends on.
- **Chain Run**: One walk-through of a chain version's steps, driven by a caller one step at a time. Tracks overall status (in progress, completed, failed, or abandoned) and which step it's currently on.
- **Chain Run Step**: The persisted record of a single step within a run — the content that was sent for that step and the caller's self-reported outcome (success, failure, and any opaque result) for it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can publish a multi-step chain and a caller can drive it from start to finish, receiving each step's content in the correct order and a correct final outcome, using nothing beyond the same mechanism already used to run a single skill.
- **SC-002**: In 100% of cases where a step is reported as failed, every downstream step depending on it receives an explicit "unavailable" indicator rather than fabricated or stale data, verified by automated test.
- **SC-003**: A chain shared with another team via the platform's existing sharing mechanism becomes runnable by that team with zero additional configuration steps beyond what sharing any other skill already requires.
- **SC-004**: Anyone with access to a completed run can retrieve its full step-by-step history and outcomes at any point afterward, without needing to re-run it or have been present for the live run.
- **SC-005**: 100% of attempts to access another organization's run or run history are denied, verified by automated test.
- **SC-006**: 100% of chains with an invalid step dependency (referencing itself, a nonexistent step, or a later step) are rejected before any run is created, verified by automated test.
- **SC-007**: 100% of racing or duplicate reports for the same already-advanced step are rejected as a conflict rather than silently applied, verified by automated test.
- **SC-008**: 100% of attempts to start or advance a run that has already finished are rejected with a clear error rather than silently succeeding, verified by automated test.

## Assumptions

- No time-based automatic expiry applies to a run a caller stops advancing — it remains open indefinitely until a later call resumes it or a caller explicitly ends it (per the originating backlog item's Open Questions; no clarification was needed since a reasonable default — no auto-expiry — applies).
- Per-step governance (which policies and objectives apply) works identically to running that same skill on its own — this feature introduces no new governance behavior, only a way to sequence already-governed steps.
- A caller-supplied step result is arbitrary opaque data up to a capped size; no schema or shape is imposed on it by the platform.
- This feature fully replaces the previously-planned standalone workflow/orchestration capability described in earlier planning documents; no separate concept, catalog, or sharing mechanism for "workflows" is introduced or maintained alongside skills.
- No production data exists yet for the earlier, now-superseded standalone workflow capability, so no data migration is required — only removal of that capability's now-unnecessary supporting pieces.
