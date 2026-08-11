# Contract: Server Actions

This feature exposes no REST route and no MCP tool — its only external interface is two new Next.js Server Actions in `src/app/(app)/prompts/actions.ts`, called directly from the New Skill drawer's client component. This mirrors the sibling `001` feature's `fetchExternalSkillSourceAction`/`importExternalSkillsAction` pair exactly in shape, kept as separate functions per the backlog's "keep genuinely separate" instruction.

## `scanLocalSkillFoldersAction(entries: LocalSkillFileEntry[])`

**Auth**: requires a signed-in caller (`requireActingUser()`), same guard every other action in this file already uses (FR-009). Throws/returns an error result before any parsing if the caller isn't authenticated.

**Input**: the client-side-filtered list of `{ relativePath, content }` entries — already narrowed to files inside detected candidate directories only (FR-012; the client never sends anything outside a candidate directory).

**Output**:
```ts
type ScanLocalSkillFoldersActionResult =
  | { ok: true; candidates: LocalSkillCandidate[]; duplicateNames: string[]; invalidFolders: Array<{ folderPath: string; reason: string }> }
  | { ok: false; error: string };
```

**Behavior**: calls the domain function `scanLocalSkillFolders(entries)` (pure, no DB access — no `withTenantContext` needed, matching `fetchExternalSkillSourceAction`'s existing "pure external read, no DB call" precedent) and returns its result directly. Never creates anything (FR-004).

## `importLocalSkillsAction(skills: LocalSkillCandidate[])`

**Auth**: requires a signed-in caller (`requireActingUser()`) (FR-009).

**Input**: the subset of previously-scanned candidates the user selected in the preview (already de-duplicated client-side per FR-013 — at most one candidate per conflicting name reaches this call).

**Output**:
```ts
interface ImportLocalSkillsResult {
  imported: string[];
  failed: Array<{ name: string; error: string }>;
}
type ImportLocalSkillsActionResult =
  | ({ ok: true } & ImportLocalSkillsResult)
  | { ok: false; error: string };
```

**Behavior**: `importLocalSkillsAction` is a thin wrapper — resolve `actingUser` via `requireActingUser()`, then delegate to a separately-exported core function:

```ts
export async function runLocalSkillImportBatch(
  actingUser: ActingUser,
  skills: LocalSkillCandidate[],
  dbOverride: typeof db = db,
): Promise<ImportLocalSkillsResult>
```

`runLocalSkillImportBatch` takes the resolved actor as a plain parameter (no `headers()`/cookie access of its own) specifically so it can be called directly from a Testcontainers-backed test, bypassing the Next.js request-context requirement `requireActingUser()` has. It also takes an optional `dbOverride` (defaulting to the real `db` singleton) for the same reason — its internal `withTenantContext` call would otherwise always hit the production-configured `db`, which is unreachable/wrong from a test even once the `headers()` problem is solved; a test passes `testDb.appDb` instead, mirroring `withApiRoute`'s `deps.db` override pattern for REST routes. Together these are what make User Story 3's per-skill isolation behavior independently testable rather than only verifiable by manual inspection (a real gap found in the sibling `001` feature's equivalent, untested `importExternalSkillsAction` loop). For each skill, in its own independent `withTenantContext(db, actingUser.orgId, tx => ...)` transaction (so one failure doesn't roll back the others — matches `importExternalSkillsAction`'s existing pattern exactly):
1. `createPrompt(tx, actor, { organizationId, name, description, sourceUrl: undefined })` — no `sourceUrl` set (FR-005; this feature has no provenance concept, unlike `001`).
2. `publishVersion(tx, actor, { promptName, organizationId, version: "v1", mainFile, supportingFiles, tags: [] })`.

A `DuplicatePromptNameError` (existing org-name collision, FR-006) or an `InvalidVersionFilesError` (content-limit violation, FR-008) thrown by either call is caught per-skill and recorded in `failed`, exactly like `importExternalSkillsAction`'s existing per-skill try/catch — the rest of the batch still proceeds (FR-007). On any success, `revalidatePath("/prompts")` is called once at the end.

**Important UI note**: unlike the sibling `001` feature's "Import from link" mode, whose confirm button is client-side disabled whenever any selected candidate's name collides with an existing org skill (`collidingNames.length > 0`), this feature's confirm button MUST stay enabled through such a collision. Otherwise User Story 3's whole premise — confirm a batch, get partial success — is unreachable through the UI, since the user would always be forced to deselect the colliding candidate first.
