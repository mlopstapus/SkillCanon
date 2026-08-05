# Cross-Page Polish & Accessibility Data Model

This feature is UI-only. The entities below are audit/documentation records and component contracts, not persisted database tables.

## InScopePageInventory

| Field | Type | Notes |
| --- | --- | --- |
| `route` | string | App Router path or representative dynamic route pattern |
| `ownerFeature` | string | Owning spec/backlog feature |
| `stateCoverage` | string[] | Empty, loading, error, populated, dialog/drawer, table/list as applicable |
| `reviewStatus` | `pending` \| `passed` \| `blocked` | Manual release audit state |
| `exception` | string | Optional documented exception for domain-specific state copy/action |

## SharedStatePattern

| Field | Type | Notes |
| --- | --- | --- |
| `variant` | `empty` \| `loading` \| `error` | Canonical state type |
| `title` | string | Short, user-facing heading |
| `description` | string | Concrete cause or next step |
| `action` | object | Optional CTA label and handler/link |
| `accessibilityRole` | string | `status` for empty/loading, `alert` for error |
| `liveRegion` | `polite` | Announces state changes without interrupting |

## AccessibilityFinding

| Field | Type | Notes |
| --- | --- | --- |
| `route` | string | Affected route or component |
| `source` | `automated` \| `keyboard` \| `screen-reader` \| `responsive` |
| `severity` | `critical` \| `serious` \| `moderate` \| `minor` |
| `impact` | string | User-facing effect |
| `resolution` | string | Code/doc/test change or accepted false-positive rationale |
| `status` | `open` \| `fixed` \| `accepted-false-positive` |

## SmokePathResult

| Field | Type | Notes |
| --- | --- | --- |
| `step` | string | Register, accept invite, create team, create project, create policy, create prompt, expand prompt, create/run skill chain, view audit log |
| `theme` | `dark` \| `light` | Theme context checked |
| `breakpoint` | `mobile` \| `tablet` \| `desktop` | Responsive viewport |
| `result` | `passed` \| `blocked` |
| `notes` | string | Regression or blocker detail |
