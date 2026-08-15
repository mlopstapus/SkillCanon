# Editable "Make a copy" (skill fork) — Design

**Date**: 2026-08-15
**Status**: Approved, ready for implementation planning

## Problem

"Make a copy" on a skill's detail page (`prompt-detail-view.tsx`'s header
button, wired to `onFork` in `prompt-detail.tsx`) currently does nothing
useful in either ownership case:

- If you **own** the skill, `forkSkillForSelfAction` throws
  `CannotForkOwnSkillError` (self-forking is deliberately rejected —
  FR-021 of `020-prompt-sharing`, since the old fork was an identical,
  unrenamable duplicate and self-forking had no meaning). The click
  handler never checks the action's result, so the failure is silently
  swallowed and the app still navigates to `/prompts`.
- If you **don't** own it, the copy is created instantly with an
  auto-generated name (`` `${source.name}-fork-${uuid.slice(0, 8)}` ``)
  and the source's content copied verbatim. You're redirected to
  `/prompts` with no indication of what just happened or where to find
  the new skill, and no way to rename or edit it before it's created.

## Decisions

1. **Self-copy stays blocked** (no behavior change to
   `CannotForkOwnSkillError`/FR-021) — but the "Make a copy" button is
   now **hidden** whenever the current user personally owns the skill
   (`prompt.ownerType === "user" && prompt.ownerId === currentUser.id`),
   instead of being shown and failing silently. Copying a skill your own
   *team* owns is unaffected and still offered (that's a different
   `(ownerType, ownerId)` pair, already allowed today).
2. **No owner picker in this pass.** "Make a copy" stays self-only
   (copies always land in your own personal ownership), matching its
   current scope. The underlying `forkSkill`/`forkSkillAction` already
   support team ownership for a future feature; this change doesn't
   touch that path.
3. **Name and content are both editable before the copy is created.**
   This replaces the instant, silent fork with a two-drawer flow that
   reuses two conventions already established elsewhere in this app.

## Flow

### Step 1 — Copy skill drawer (new)

Clicking "Make a copy" (only shown when you don't personally own the
skill) opens a small drawer, structurally the same as today's blank
"New Skill" step:

- **Name**: prefilled with a suggested, human-readable default (e.g.
  `` `${source.name}-copy` ``, de-duplicated against existing org skill
  names the same way `NewPromptDrawer`'s import-mode collision check
  already works), fully editable.
- **Description**: prefilled from the source skill's description,
  editable.

Submitting calls `forkSkillForSelfAction(sourceSkillId, { name,
description })`, which now does **shell creation only**:

- Runs the same validation `forkSkill` already does: source exists and
  is in the caller's org (`SourceSkillNotFoundError`), self-fork check
  (`CannotForkOwnSkillError`, defense in depth even though the button is
  hidden), team-admin authorization when forking into team ownership
  (unused by this self-only UI path, kept for the shared
  `forkSkillAction` entry point).
- Creates the new `Prompt` row: your ownership, `forkedFromSkillId` set
  to the source's id, `activeVersionId: null` (no version yet — same
  "shell first" state a blank-created skill starts in per
  `032-skill-file-format-refactor`'s FR-018).
- Records the `SkillForked` audit event at this point (lineage is
  established here, regardless of what happens in Step 2).
- Duplicate-name collision surfaces as an inline form error, same
  pattern `NewPromptDrawer`'s blank mode already uses.

On success, this drawer closes and Step 2 opens automatically.

### Step 2 — New Version drawer (reused as-is)

The existing `NewVersionDrawer` opens against the **newly created**
skill's name, but prefilled from the **source** skill's current active
version content instead of blank:

- Template-kind, new-shape source: `mainFileContent` /
  `supportingFiles` from the source's `files`.
- Template-kind, legacy-shape source (pre-`032`, no `files` array):
  prefill the main file with the source's `legacySystemTemplate` and
  `legacyUserTemplate` content concatenated (labeled sections), so
  nothing is silently dropped — you can reshape it into the current
  file format before publishing.
- Chain-kind source: prefill `steps` from the source's chain steps
  (already supported by `NewVersionDrawer`'s `activeVersionSteps` prop).
- Tags: prefilled from the source's active version tags.

You edit freely and submit through the existing
`publishVersionAction(newSkillName, ...)` — no new backend path here.

If you close this drawer without publishing, the copy shell persists
with no active version — the same already-accepted state a blank-created
skill can be left in.

## Backend changes

- `src/bcs/prompt-registry/domain/subscription.ts`: `ForkSkillParams`
  gains `name: string` and `description?: string`; no longer just
  `{ ownerType, ownerId }`.
- `src/bcs/prompt-registry/application/fork-skill.ts`: strip out all
  version/file copying (`findVersionById`, `insertPromptVersion`,
  `insertFiles`, the `updatePrompt(..., { activeVersionId })` call). It
  becomes a shell-only operation: validate, `insertPrompt` with the
  caller-supplied `name`/`description` and `forkedFromSkillId`, write
  the `skill.forked` audit event, return the new prompt.
- `src/app/(app)/prompts/actions.ts`: `forkSkillForSelfAction` and
  `forkSkillAction` take the new `{ name, description }` fields and
  return the created prompt's `{ id, name }` on success (needed so the
  client can open Step 2 against the right skill without a refetch).
- No changes needed to `publishVersion`/`publishVersionAction` — Step 2
  is just a normal version publish.

## Frontend changes

- `src/app/(app)/prompts/[name]/prompt-detail-view.tsx`: add
  `isOwnSkill: boolean` to `PromptDetailData`; render the "Make a copy"
  button only when `!data.isOwnSkill`.
- `src/app/(app)/prompts/[name]/page.tsx`: compute `isOwnSkill` from
  `prompt.ownerType`/`prompt.ownerId` vs. the session user, pass it
  through.
- New `src/app/(app)/prompts/[name]/copy-skill-drawer.tsx`: the Step 1
  drawer described above (name + description, existing-name collision
  check, submit → `forkSkillForSelfAction`).
- `src/app/(app)/prompts/[name]/prompt-detail.tsx`: replace the current
  one-line `onFork` handler with drawer-open state for Step 1; on its
  success, open `NewVersionDrawer` (already imported) prefilled from
  the **source** skill's own `data.*` content instead of the active
  skill's, targeting the newly created skill's name for
  `publishVersionAction`. After Step 2 succeeds, `router.push` to the
  new skill's detail page (`/prompts/${newSkillName}`) instead of the
  current `/prompts` list redirect — so you land on the actual result.

## Out of scope

- Choosing a team (or another user) as the copy's owner.
- Any change to `forkSkillAction`'s team-authorization path beyond
  passing through the new `name`/`description` fields.
- Any change to subscribe/unsubscribe behavior.
- Bulk copy of multiple versions — only the current active version's
  content is offered as Step 2's starting point, matching today's
  fork's existing "current active version only" behavior.

## Testing

- `fork-skill.test.ts`: update existing assertions for the new
  shell-only behavior (no version/files created by `forkSkill` itself
  anymore); add a case asserting the custom `name`/`description` are
  used verbatim (no more hash-suffixed auto-name) and that
  `SkillForked` fires with `activeVersionId: null`.
- New test coverage for `copy-skill-drawer.tsx`'s structural rendering
  (name/description fields, collision error display) — same
  `renderToStaticMarkup` convention used for the New Skill drawer's
  static content.
- Manual browser verification (per this repo's convention for
  client-interaction-heavy drawer flows): copy a skill you don't own,
  confirm the button is absent on a skill you do own, edit name/content
  through both steps, and confirm the resulting skill's content, name,
  and lineage (`forkedFromSkillId`) are correct.
