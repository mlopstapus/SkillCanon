# Backlog

Epics live in `backlog/<NNN-epic>/` with an `EPIC.md` and one file per feature. Each feature file is the spec: requirements, acceptance criteria, open questions.

**Keeping it current.** The PR that satisfies a feature's last criterion archives the file in the same PR: tick every criterion it demonstrably satisfied (cite the PR number inline, e.g. `(#113)`), set `status: done`, `git mv` the file to the epic's `archive/`, and update the epic's `EPIC.md` list (check the box and point the link at `archive/…`). A criterion that genuinely needs a person (a real external account, a provider key, a clean-machine check, a package publish) stays unticked and marked "needs Ben"; the file stays open until it is ticked, or until the remaining items are moved to a follow-up feature file. A fully archived epic moves to `backlog/done/`. Captain audits the backlog after each wave and corrects anything a PR missed.
