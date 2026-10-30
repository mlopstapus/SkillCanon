# Epic 017: Cross-Model Evals

**Priority:** 4
**Status:** not-started
**Goal:** A skill owner can see, before publishing a version, how it performs across several models, and compare that with the previous version.

## Overview

SkillCanon's README says it never calls an LLM. Evals need model calls, so the first feature is a decision on where they run. The recommendation is the CLI with the user's own keys: the server stays LLM-free, and the server stores and shows results keyed by skill version, content digest (016/001) and model.

## Features

- [ ] [001 - PDR: Where Evals Run](001-pdr-where-evals-run.md)
- [x] [002 - Eval Case Format](archive/002-eval-case-format.md)
- [ ] [003 - skillcanon eval](003-skillcanon-eval.md)
- [ ] [004 - Results Matrix](004-results-matrix.md)
- [ ] [005 - Optional Publish Gate](005-optional-publish-gate.md)

_Completed features are moved to `archive/` and checked off here._

## Dependencies

- `backlog/016-skill-feedback/` 001 (the content digest results are keyed by)
