# Feature Specification: Project Usage Metrics Dashboard

**Feature Branch**: `024-project-usage-metrics-dashboard`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "backlog/006-prompt-registry/008-project-usage-metrics-dashboard.md — implement the Project Detail page's 'Metrics' tab from the SkillCanon Prompts.dc.html mockup: total invocations, active skills/contributors, required-skill coverage with gap call-outs, a 14-day invocation trend (as a stacked bar chart, one segment per skill), and usage broken down by skill and by member."

## Clarifications

### Session 2026-08-01

- Q: Should the prompt detail page's live-preview "test this prompt" flow count as project usage, given it's currently the only real caller of `expand()` in the codebase? → A: No — test/preview invocations must never be recorded or counted as usage, under any circumstance.
- Q: With test/preview invocations excluded, no genuine (non-test) caller of `expand()` currently exists — the CLI/REST/MCP transport that would generate real usage belongs to the not-yet-started `008-distribution` epic. What should this feature do about that? → A: Accept it — this feature builds only the usage-capture plumbing and dashboard UI; every project correctly shows the "no usage yet" empty state until `008-distribution` ships a genuine invocation transport. Not a partial/broken implementation — a correct empty state for data that doesn't exist yet.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See whether a project's required skills are actually being used (Priority: P1)

A project lead opens a project's Metrics tab and immediately sees, at a glance, whether the project is healthy from a governance standpoint: how much activity there's been, how many of the project's skills and people are actually active, and whether required skills are being adopted.

**Why this priority**: This is the core value proposition — a governed prompt registry is only useful if someone can tell whether governance is actually working. Without this, "required skills" is a label with no accountability behind it.

**Independent Test**: Open a project with existing usage and at least one required skill; the four summary tiles (total invocations, active skills, active contributors, required-skill coverage) show real counts computed from recorded usage.

**Acceptance Scenarios**:

1. **Given** a project with recorded invocations across several skills and members, **When** the project lead opens the Metrics tab, **Then** the tiles show the correct all-time invocation total and the correct rolling-30-day active-skill and active-contributor counts.
2. **Given** a project with two required skills, one used by every member in the last 30 days and one used by none, **When** the project lead views the coverage tile, **Then** it reflects partial coverage (e.g. "1/2"), not full or zero coverage.
3. **Given** a project with no required skills assigned, **When** the project lead views the coverage tile, **Then** it shows a neutral "not applicable" state rather than 0% or a fabricated ratio.

---

### User Story 2 - Find exactly who isn't using a required skill (Priority: P2)

A project lead needs to know precisely which team members have not used a project's required skill recently, so they can follow up individually rather than guessing from aggregate numbers.

**Why this priority**: Aggregate coverage alone doesn't drive action — knowing *who* to talk to does. This is the second most valuable thing on the page after knowing something is wrong at all.

**Independent Test**: Open a project where at least one member hasn't used a required skill in the last 30 days; that member's name and the specific missing skill appear in a gap list, without needing to cross-reference any other page.

**Acceptance Scenarios**:

1. **Given** a project member who has not invoked a required skill within the last 30 days, **When** the project lead views the Metrics tab, **Then** that member's name and the specific skill they're missing appear in the gap panel.
2. **Given** every project member has used every required skill within the last 30 days, **When** the project lead views the Metrics tab, **Then** an all-clear message appears instead of an empty or missing gap panel.
3. **Given** a project member who has never used *anything* in the project, **When** the project has at least one required skill, **Then** that member still appears in the gap panel for every required skill they haven't used — inactivity is not treated differently from selective non-adoption.

---

### User Story 3 - Understand usage trends and breakdowns (Priority: P3)

A project lead wants to see how invocation volume has moved over the last two weeks, broken down by which skill drove it, plus straightforward tables of total usage by skill and by member, to spot patterns (a skill falling out of use, a member ramping up).

**Why this priority**: Useful context once the headline health signals (P1) and actionable gaps (P2) are in view, but not itself the thing that tells a lead whether to act.

**Independent Test**: Open a project with a mix of usage across multiple skills over the last 14 days; the trend chart renders one visually distinct segment per skill within each day's bar, and the by-skill/by-member tables list real counts.

**Acceptance Scenarios**:

1. **Given** a project with invocations of three different skills spread across the last 14 days, **When** the project lead views the trend chart, **Then** each day's bar is visually divided into segments proportional to that day's per-skill invocation counts, stacked within a single bar per day.
2. **Given** a day with zero invocations within the 14-day window, **When** the project lead views the trend chart, **Then** that day still appears on the chart with an empty/zero-height bar rather than being skipped.
3. **Given** a project with recorded usage, **When** the project lead views the by-skill and by-member tables, **Then** each row shows a real invocation count and a real last-used/last-active date, sorted so the most active rows are easy to find.

---

### Edge Cases

- What happens when a project has zero recorded usage at all? Every tile, chart, and table must show a real "no usage yet" empty state, not a blank area, a broken chart, or fabricated sample data.
- What happens when a project has curated skills but no assigned members, or members but no curated skills? Each section's own empty state applies independently (e.g. the by-skill table can be non-empty while the by-member table is empty).
- What happens when an invocation has no acting user (an ungoverned call)? It's excluded from the active-contributors count and from per-member attribution, and shown as a distinct "no user" bucket in the by-member table rather than silently dropped or attributed to the wrong person.
- What happens when an invocation has no project context at all (an ad hoc/personal expansion)? It's still recorded, but excluded entirely from every project's dashboard — it never contributes to any project's tiles, gaps, trend, or tables.
- What happens when a prompt is invoked from the prompt detail page's live-preview/test flow? It is never recorded as a usage event in the first place — not recorded-then-filtered, simply never captured — so it cannot leak into any metric by omission of a filter somewhere.
- What happens when a prompt is later removed from a project's curated list but has historical usage? Historical usage rows remain valid data; how removed skills are (or aren't) reflected in the by-skill table is out of scope for this feature to resolve — noted as an assumption, not solved here.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST record a usage event for every genuine (non-test, non-preview) prompt expansion, capturing at minimum: which prompt, which prompt version, the organization, and — when known — the acting user and the project context. As of this feature, no genuine (non-test) caller of `expand()` exists anywhere in the codebase (see Clarifications) — this requirement is satisfied by the capture plumbing existing and working correctly (verified directly, not end-to-end), and is expected to become live-exercised once `008-distribution` ships a real invocation transport.
- **FR-002**: Usage events with no project context (ad hoc/personal expansions) MUST still be recorded, and MUST be excluded from every project-scoped view rather than causing a failure or being silently discarded before storage.
- **FR-002a**: Invocations made through the prompt detail page's live-preview/test flow MUST NOT be recorded as a usage event at all — test/preview activity must never contribute to any invocation count, active-skill/contributor tile, coverage calculation, gap panel, trend, or breakdown table, under any circumstance.
- **FR-003**: A project's Metrics tab MUST display four summary figures: total invocations (all-time), active skills (rolling 30-day count of distinct skills invoked), active contributors (rolling 30-day count of distinct attributed users), and required-skill coverage (rolling 30-day).
- **FR-004**: Required-skill coverage MUST be evaluated against every member of the project, not only members who have any recorded activity — a member with zero usage of a required skill is a gap regardless of their overall activity level.
- **FR-005**: The system MUST identify and list, per project, which specific members have not used which specific required skills within the rolling 30-day window.
- **FR-006**: When a project has no gaps (every member current on every required skill) or has no required skills at all, the system MUST show an unambiguous all-clear or not-applicable state instead of an empty gap list that could be mistaken for missing data.
- **FR-007**: The Metrics tab MUST display a 14-day invocation trend as a stacked bar chart — one bar per day, each bar divided into segments representing that day's invocation count per skill — with days that have zero invocations still represented.
- **FR-008**: The Metrics tab MUST display an all-time usage breakdown by skill, including invocation count and last-used date per skill.
- **FR-009**: The Metrics tab MUST display an all-time usage breakdown by member, including invocation count and last-active date per member, with invocations lacking an attributed user grouped into their own bucket rather than omitted or misattributed.
- **FR-010**: Branch- and repository-level usage metrics (a per-branch gap panel, a usage-by-branch table) are out of scope for this feature — no data path exists today that attributes an invocation to a repository or branch.
- **FR-011**: Every tile, panel, chart, and table on the Metrics tab MUST render a real, distinct empty state when it has no underlying data, and MUST NEVER display placeholder or sample data in place of real usage.

### Key Entities *(include if feature involves data)*

- **Usage Event**: A record that one expansion of one prompt happened — which prompt/version, which organization, and (when known) which project and which user. The foundation every metric on this page is computed from. May exist with no project or user attached (ad hoc usage), in which case it's excluded from every project's dashboard.
- **Project Member**: A user's membership in a project. The population checked against required-skill coverage — every member is evaluated, whether or not they have recorded activity.
- **Skill Requirement**: A project's designation of a curated skill as "required" versus "optional." An existing concept this feature reads from, not one it defines.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A project lead can determine whether their project's required skills are actually being used, entirely from one page, with no need to inspect another page or ask another team.
- **SC-002**: A project lead can identify every specific team member who has not used a required skill in the last 30 days, by name, directly from the dashboard, with zero false negatives (a real gap always appears) and zero false positives (an up-to-date member never appears as a gap).
- **SC-003**: A project lead can see how invocation volume for each skill has moved over the last 14 days, broken down per skill, without exporting data or requesting a report from anyone else.
- **SC-004**: A project with no recorded usage presents a clear "no usage yet" state rather than a blank, broken, or misleading page.
- **SC-005**: Every number and row shown on the dashboard corresponds to real recorded usage — sample or placeholder data never appears under any circumstance.

## Assumptions

- Usage capture is added by extending the already-planned `distribution.prompt_usage` table (pulled forward from the not-yet-started `008-distribution` epic's usage-telemetry item), rather than a new, separately-owned usage table — avoids two bounded contexts each independently capturing "an invocation happened." Documented on both sides per this repo's established pull-forward convention (see `backlog/006-prompt-registry/008-project-usage-metrics-dashboard.md` and `backlog/008-distribution/004-usage-telemetry.md`).
- "Active" (for the active-skills and active-contributors tiles) and required-skill coverage are measured on a rolling 30-day window; total invocations and the by-skill/by-member tables are all-time — chosen for consistency between the tiles and to keep governance signals from becoming permanently "compliant" after a single historical use.
- Ad hoc/personal expansions (no project context) are recorded but always excluded from every project-scoped view in this feature — no personal-usage view exists yet to consume them, but no capture work is lost when one is eventually built.
- Branch- and repository-level metrics (the mockup's usage-by-branch table and branch-level gap panel) are explicitly out of scope for this feature. `expand()` has no repo/branch parameters today; that context only becomes available once `011-vcs-integration`'s CLI git-context tagging feature extends the same usage table later.
- The prompt detail page's live-preview "test this prompt" flow — currently the only real caller of `expand()` in the codebase — is never recorded as usage (resolved via Clarifications, 2026-08-01). Recording is scoped to whichever call site represents genuine (non-test) invocation, not to every `expand()` call indiscriminately.
- No genuine (non-test) caller of `expand()` exists anywhere in the codebase yet — that's the CLI/REST/MCP transport owned by the not-yet-started `008-distribution` epic. This feature is expected to ship with every project legitimately showing the "no usage yet" empty state until that transport exists; this is a correct outcome for this feature, not an incomplete one (resolved via Clarifications, 2026-08-01).
- The chart type for the 14-day trend is a stacked bar chart with one segment per skill (an explicit deviation from the source mockup, which renders a single-color aggregate bar per day).
