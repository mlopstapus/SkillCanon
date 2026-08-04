# skillcanon

Syncs a repository's Claude Code skills with a [SkillCanon](https://github.com/mlopstapus/SkillCanon) project's governed prompt roster. Every skill stub is thin — invoking one always resolves the prompt's content live, never from a cache, so a policy or objective change takes effect on the very next invocation.

## Install

```sh
pnpm --dir cli install
pnpm --dir cli run build
pnpm --dir cli link --global   # makes `skillcanon` available on PATH
```

## Usage

### `skillcanon init --project-key <url> [--api-key <key>]`

One-time setup. `--project-key` is **the project's own page URL** in the SkillCanon web UI — e.g. `https://skillcanon.example.com/projects/<id>` — copied straight from your browser's address bar while viewing that project. It encodes both which SkillCanon server to talk to and which project to link, so there's nothing else to configure. If `--api-key` is omitted, you'll be prompted for it (not echoed to the terminal).

`init` writes a committable `.skillcanon/project.json`, a git-ignored `.skillcanon/credentials.json`, installs a Claude Code `SessionStart` hook so the roster stays in sync automatically, adds a short blurb to `CLAUDE.md`/`AGENTS.md`, and runs an initial sync.

### `skillcanon sync [--force] [--quiet]`

Re-syncs `.claude/skills/skillcanon-*/` against the linked project's current prompt roster. Runs automatically on every Claude Code session start (via the hook `init` installs) — you don't normally need to run this by hand.

- `--force`: overwrite a stub you've hand-edited (normally left untouched and flagged).
- `--quiet`: warn instead of erroring on a connectivity/auth failure — used by the automatic hook so a bad network connection never blocks a Claude Code session from starting.

### `skillcanon run <slug> [--input '<json>']`

Resolves one governed prompt live and prints it to stdout. This is what each generated skill stub actually invokes — you normally won't run this by hand either, except to test a prompt directly.

## How a synced skill works

Each `.claude/skills/skillcanon-<slug>/SKILL.md` is a thin stub: its `name`/`description` frontmatter come from the prompt's own metadata (so Claude's skill-matching picks the right one), and its body is a single instruction — run `skillcanon run <slug>` and follow the output as instructions. Nothing about the prompt's actual content is ever stored locally.
