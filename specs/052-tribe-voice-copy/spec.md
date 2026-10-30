# Feature Specification: Copy in the Tribe Voice

**Feature**: `052-tribe-voice-copy` · **Backlog**: `backlog/018-internal-tribe-edition/004-tribe-voice-copy.md` · **Depends on**: #126 (018/002, register and invitation-only copy). Voice rules: `tribe-bazaar:tribe-design` `voice/GUIDE.md`, website register.

Defaults used (Ben to confirm): D6 name stays "SkillCanon", shown once per surface and as "SkillCanon · Tribe" in the page title; sentence-case headlines with a terminal period; no hype vocabulary.

## Requirements
- **FR-001** Auth screens (brand rail, login, setup, welcome, invite) say what the tool is for at Tribe in one or two sentences. No "prompt control plane", feature bullets, "self-hosted" or "tenant-aware".
- **FR-002** Root metadata: title "SkillCanon · Tribe", description names the internal tool.
- **FR-003** No compliance claims ("SOC2") or banned vocabulary in `src` or the README.
- **FR-004** README opens as Tribe's internal skills registry and says how to get access (ask an admin for an invitation). The quickstart stays.
- **FR-005** Copy only; no layout or styling changes (018/003 owns those).
