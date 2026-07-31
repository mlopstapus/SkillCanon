# Quickstart: Project Skill Assignment

This is a validation guide, not implementation — it proves the feature end-to-end once built. Full behavior details live in `data-model.md` and `spec.md`; this only sequences the calls.

## Prerequisites

- `pnpm install`
- A running Postgres (Testcontainers spins one up automatically for the test suite — no manual setup needed for automated validation)
- Migrations applied: `prompt_registry.project_teams` and `prompt_registry.project_skill_assignments` tables exist (via `pnpm db:migrate` once this feature's migrations are generated)

## Scenario 1 — Establish participating teams, then assign a skill from a collaborator's catalog

```ts
import {
  createProject,
  addCollaboratorTeam,
  createPrompt,
  assignSkillToProject,
  listRequiredSkillsForProject,
} from "@/bcs/prompt-registry";

// Owner team A creates a project
const project = await createProject(db, actor, { organizationId, teamId: teamA, name: "Payments", slug: "payments" }, verifier);

// Team B (a different, same-org team) joins as a collaborator — only an owner-team-A admin may do this
await addCollaboratorTeam(db, actingUserAdminOfTeamA, project.id, { teamId: teamB });

// A skill owned by team B (not team A) can now be assigned to the project
const skill = await createPrompt(db, actorTeamBOwnerActor, { organizationId, name: "review-checklist" });
// ...forkSkill/subscribeSkill it into team B's ownership first if it started personal — see 020-prompt-sharing...

await assignSkillToProject(db, actingUserAdminOfTeamA, project.id, skill.id, { requirement: "required" });

const required = await listRequiredSkillsForProject(db, organizationId, project.id);
// required === ["review-checklist"] — a flat name list, no team-chain resolution
```

**Expected outcome**: a skill owned by a *collaborator* team (not the project's owner team) is a valid assignment target once — and only once — that team actually participates in the project.

## Scenario 2 — Rejections: non-participating team, personal skill, duplicate

```ts
import { assignSkillToProject, createPrompt } from "@/bcs/prompt-registry";

// Team C never joined the project — assigning its skill fails
const skillC = await createPrompt(db, actorTeamCOwnerActor, { organizationId, name: "unrelated" });
await assignSkillToProject(db, actingUserAdminOfTeamA, project.id, skillC.id, { requirement: "optional" });
// throws SkillNotEligibleForProjectError

// A personal skill is always rejected, even for its own owner
const personalSkill = await createPrompt(db, actorAdminAsIndividual, { organizationId, name: "my-personal-skill" });
await assignSkillToProject(db, actingUserAdminOfTeamA, project.id, personalSkill.id, { requirement: "optional" });
// throws PersonalSkillNotAssignableError

// Assigning the same (project, skill) pair twice is rejected
await assignSkillToProject(db, actingUserAdminOfTeamA, project.id, skill.id, { requirement: "optional" });
// throws DuplicateProjectSkillAssignmentError — skill.id was already assigned in Scenario 1
```

**Expected outcome**: eligibility and duplicate checks reject cleanly with no row or audit event written.

## Scenario 3 — Project members see everything assigned, regardless of contributing team

```ts
import { addProjectMember, listPrompts } from "@/bcs/prompt-registry";

// A member who belongs only to the owner team (never to collaborator team B)
await addProjectMember(db, actorAdmin, { projectId: project.id, userId: memberOnlyInTeamA });

const accessible = await listPrompts(db, { organizationId, userId: memberOnlyInTeamA }, { projectId: project.id });
// includes "review-checklist" (team B's skill, assigned to the project) even though
// this member has never belonged to team B and does not subscribe to it directly

const nonMemberAccessible = await listPrompts(db, { organizationId, userId: someUnrelatedUser }, { projectId: project.id });
// projectId is silently ignored for a non-member — same result as calling listPrompts with no projectId at all
```

**Expected outcome**: project membership, not team membership, is what unlocks a project's assigned catalog — the access-model guarantee PDR-016 depends on.

## Scenario 4 — Unassign, and remove a collaborator team

```ts
import { unassignSkillFromProject, removeCollaboratorTeam, listRequiredSkillsForProject } from "@/bcs/prompt-registry";

await unassignSkillFromProject(db, actingUserAdminOfTeamA, project.id, skill.id);
const requiredAfter = await listRequiredSkillsForProject(db, organizationId, project.id);
// requiredAfter no longer includes "review-checklist"

await removeCollaboratorTeam(db, actingUserAdminOfTeamA, project.id, { teamId: teamB });
// Team B's project list no longer includes this project; its existing (now-orphaned)
// assignment history, if any remained, is untouched — this feature does not retroactively
// clean up assignments when a contributing team's collaborator status is revoked (Edge Cases)
```

**Expected outcome**: both removals are simple, reversible, side-effect-free operations — the same "present or absent, nothing in between" shape as `020-prompt-sharing`'s `Subscription`.

## Running the real test suite

```bash
pnpm vitest run src/bcs/prompt-registry
```

Expect the full existing suite plus this feature's new files (`add-collaborator-team.test.ts`, `remove-collaborator-team.test.ts`, `list-project-teams.test.ts`, `assign-skill-to-project.test.ts`, `unassign-skill-from-project.test.ts`, `list-required-skills-for-project.test.ts`, extended `list-prompts.test.ts`, extended `projects-repo.test.ts`) to pass — Testcontainers-backed, no manual DB setup required.
