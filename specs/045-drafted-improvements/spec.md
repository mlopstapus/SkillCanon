# Feature Specification: Drafted Improvements

**Feature Branch**: `feat/drafted-improvements`
**Created**: 2026-10-30
**Source**: `backlog/016-skill-feedback/004-drafted-improvements.md` (requirements and decided-by-default open questions are in that file).

## User Scenarios & Testing

### User Story 1 - Turn open notes into a proposed new version (P1)
On a skill's Feedback tab an owner picks a version with open notes, asks for a draft, reviews a line diff and rationale, and accepts it as the next version or dismisses it.
1. **Given** two open notes on version 1 and an opted-in organization with a provider, **When** the owner requests a draft, **Then** a pending draft shows the diff and cites 2 notes.
2. **When** accepted, **Then** the next version is published with the proposal as its main file (supporting files kept) and both notes show addressed in it.
3. **When** dismissed, **Then** nothing else changes; the notes stay open.

### User Story 2 - Safe by default (P1)
No provider configured, or the organization has not opted in, or the caller is not the owner: drafting is refused with a clear message and nothing is stored. A model error or timeout stores nothing.

## Requirements
- FR-001..FR-005 as in the backlog file's Requirements.
- FR-006 Context is capped (20 notes, 100k characters, 60 s).
- FR-007 Opt-in is per organization, admin-set, audited; PDR-020 is amended.
- FR-008 The model call sits behind an `ImprovementDrafter` port; the shipped implementation is env-configured Anthropic.

## Assumptions
- A live-provider call is not exercised in CI (needs Ben's key); tests use a stub drafter and a fake fetch.
- The opt-in will be unified with lane H's evals opt-in once that lands.
