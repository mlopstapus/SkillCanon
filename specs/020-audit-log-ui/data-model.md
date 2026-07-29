# Phase 1 Data Model: Audit Log UI

This feature adds no new tables and no schema migration. It reads the existing, already-shipped `audit.audit_events` table (via `listAuditEvents`) and composes several other bounded contexts' entities purely for display. The "data model" here is the set of view-level shapes this feature introduces, plus the small new getter contracts research.md decided on.

## Existing entities (read-only reference, unchanged)

### AuditEvent (`src/bcs/audit-compliance/domain/audit-event.ts`)

```ts
interface AuditEvent {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  action: string;             // "<resourceType>.<verb>", verb from AUDIT_ACTION_VERBS
  resourceType: string;       // "user" | "team" | "organization" | "invitation" | "api_key"
                               // | "project" | "prompt" | "prompt_version" | "project_member"
                               // | "policy" | "objective" (only real values seen in production today)
  resourceId: string | null;
  before: unknown | null;     // redacted jsonb diff
  after: unknown | null;      // redacted jsonb diff
  transport: "web" | "api" | "cli" | "system";
  sourceIp: string | null;
  createdAt: Date;
}
```

No field on this record is added or changed by this feature.

## New view-model shapes (this feature)

### ResolvedAuditRow

The shape the row list and detail drawer actually render — `AuditEvent` plus resolved display strings, computed server-side per page load (never persisted).

```ts
interface ResolvedAuditRow {
  event: AuditEvent;
  resourceDisplayName: string;   // resolved name, or event.resourceId as fallback
  resourceNameResolved: boolean; // false when the raw-id fallback was used (drives subtle "unresolved" styling, not an error state)
  actor: ResolvedActor;
}

interface ResolvedActor {
  kind: "user" | "api_key" | "system";
  id: string | null;             // actorUserId or actorApiKeyId; null for "system"
  displayName: string;           // user displayName, api key name, or literal "system"
  subtitle: string;              // "admin"/"member" for a user, "API key" for a key, "scheduled" for system — team name omitted (would need a further per-actor team lookup FR-003 doesn't require)
}
```

### AuditActorOption

Powers the Actor filter dropdown — one entry per distinct actor found in the org's currently-retained events (not just currently-active org members), per the Clarifications decision.

```ts
interface AuditActorOption {
  actorUserId: string | null;
  actorApiKeyId: string | null;
  displayName: string;
  subtitle: string;
}
```

### AuditLogFilterState (URL query-param contract)

The filter bar's state, round-tripped through the page's URL query string (research.md's "Filter state persistence" decision):

```ts
interface AuditLogFilterState {
  q?: string;                 // free-text search
  resource?: string;          // resourceType, or omitted for "all"
  actorUserId?: string;       // mutually exclusive with actorApiKeyId
  actorApiKeyId?: string;
  transport?: "web" | "api" | "cli" | "system";
  range?: "24h" | "7d" | "30d" | "all" | "custom";
  from?: string;               // ISO date, only meaningful when range === "custom"
  to?: string;                 // ISO date, only meaningful when range === "custom"
  page?: string;               // 1-based
}
```

Maps directly onto `AuditEventFilters` (`src/bcs/audit-compliance/domain/audit-event.ts`, unchanged) when calling `listAuditEvents`; `actorUserId`/`actorApiKeyId` map onto that interface's existing, already-separate fields.

## New getter contracts (thin wrappers, one per BC)

Each of these mirrors the exact shape of an already-existing sibling getter in its own BC (`getTeam`, `getPolicy`, `getProject`, etc.) — same org-scoping convention, same not-found handling.

### `identity-access`

```ts
// New — wraps invitations-repo.findByOrgAndId (infra already exists)
function getInvitation(db: Db, organizationId: string, invitationId: string): Promise<InvitationSummary | null>;

// New — wraps api-keys-repo.findByOrgAndId (infra already exists)
function getApiKeySummary(db: Db, organizationId: string, apiKeyId: string): Promise<ApiKeySummary | null>;
```

Both return `null` (not throw) on a not-found id — matching `getObjective`'s and `getPrompt`'s existing null-return convention, since a resolver caller treats "not found" as an ordinary fallback case, not an exceptional one.

### `prompt-registry`

```ts
// New — wraps prompts-repo.findPromptByOrgAndId (infra already exists)
function getPromptById(db: Db, organizationId: string, promptId: string): Promise<PromptSummary | null>;

// New — wraps prompt-versions-repo.findVersionById (infra already exists; no org param needed, join through the parent prompt if org-scoping is desired — see Open Question below)
function getPromptVersion(db: Db, versionId: string): Promise<PromptVersionSummary | null>;
```

**Open question for tasks.md to settle during implementation**: `findVersionById` takes no `organizationId` — confirm during implementation whether it should be given one (joining through the owning prompt) for defense-in-depth consistency with every other new getter here, or whether a version id is already sufficiently unguessable (UUID) that an unscoped read-only lookup is acceptable for this presentation-only path. Default to adding the org-scoped join if it costs no more than a one-line change, to keep every new getter following the identical, auditable convention.

### `audit-compliance` (fully internal; no other BC touches these)

```ts
// New — extends audit-events-repo.ts
function listDistinctActors(
  tx: Db,
  organizationId: string,
  retentionCutoff: Date,
): Promise<{ actorUserId: string | null; actorApiKeyId: string | null }[]>;

// New — application layer, composes the getters above
function resolveResourceDisplayName(
  db: Db,
  organizationId: string,
  requestingUserId: string, // threaded through only because governance's PolicyActor/ObjectiveActor require it structurally; getPolicy/getObjective don't actually use it for a read
  resourceType: string,
  resourceId: string | null,
): Promise<{ name: string; resolved: boolean }>;

function resolveActorDisplayName(
  db: Db,
  organizationId: string,
  actorUserId: string | null,
  actorApiKeyId: string | null,
): Promise<ResolvedActor>;
```

## State / lifecycle notes

- `AuditEvent` itself has no state transitions (append-only, immutable) — unchanged by this feature.
- `ResolvedAuditRow`/`AuditActorOption`/resolved display names have no persistence and no lifecycle — recomputed on every request, always reflecting current data (a resource renamed since the event was recorded shows its *current* name, per the Clarifications' explicit "live resolution" choice, not a snapshot).
