"""Characterization harness for the Skill Expansion Engine port (021-expansion-engine).

Runs the REAL legacy `expand_prompt` (`src/spechub_server/services/prompt_service.py`)
directly against a fixed set of fixture scenarios — no HTTP, no running server,
just an in-memory SQLite-backed AsyncSession exactly like `tests/conftest.py`
uses. Records each scenario's output as JSON to
`expand_characterization_output.json` (in this same directory) so the
TypeScript side (`src/bcs/prompt-registry/application/expand-characterization.test.ts`)
can assert its own `expand()` produces identical output for the *same*
fixture data, without needing Python/`uv` available at `vitest` run time.

Run via (per CLAUDE.md's legacy-test convention):

    cd legacy/backend && uv run python scratch/expand_characterization_harness.py

--------------------------------------------------------------------------
Why this file bootstraps its own imports instead of `from src.spechub_server
import ...` directly
--------------------------------------------------------------------------
This repo's physical legacy package directory is `src/spechub_server/` (it
was never `git mv`-ed), but a repo-wide SpecHub -> SkillCanon text-rename
commit (115dbd2, "rename") already rewrote *every* internal absolute import
inside that directory to say `from src.skillcanon_server....` instead —
including `prompt_service.py` itself, `models.py`'s dependents,
`policy_service.py`, `objective_service.py`, and `team_service.py`. That
mismatch means the legacy backend's own test suite (`tests/conftest.py`,
which imports `from src.skillcanon_server.models import ...`) is currently
broken (`ModuleNotFoundError: No module named 'src.skillcanon_server'`),
independent of anything in this feature.

Renaming the physical directory was out of scope for this feature (a
repo-wide change with its own blast radius) and a `git mv` was blocked by
this environment's own safety classifier when attempted. Fixing it file by
file (5 files reference `skillcanon_server`) would mean editing legacy
application code to chase an unrelated bug. Instead, this harness aliases
the module tree in `sys.modules` *before* importing anything from it: once
`src.skillcanon_server` resolves to the real, physically-`spechub_server`
package (with its correct on-disk `__path__`), every one of its own
`from src.skillcanon_server...` imports resolves transparently through the
same physical files — no source file is duplicated or re-executed under two
different identities, and no legacy source is edited.

If the physical directory is ever renamed to `skillcanon_server` (the
"real" fix), this bootstrap becomes a no-op you can delete.
--------------------------------------------------------------------------

Keeping fixtures in sync with the TypeScript side
--------------------------------------------------------------------------
This harness's fixture scenarios are hand-mirrored (not read from a shared
file) against
`src/bcs/prompt-registry/application/expansion-test-helpers.ts` and the
scenario set exercised in
`src/bcs/prompt-registry/application/expand-characterization.test.ts`.
A shared JSON fixture file was considered and rejected: the two engines'
underlying schemas differ enough (legacy has no `organizationId`/no
team-vs-user skill ownership; ids/teams/users must be constructed
differently on each side) that only the *literal* content — skill names,
template strings, policy/objective names and content, and caller input —
actually needs to match, not the fixture-setup plumbing. Each scenario below
is named and each literal value is called out in a comment; the TypeScript
characterization test names its own scenarios identically and reuses the
exact same literal strings. If you change a literal value on one side,
change it on the other.
"""

import asyncio
import json
import sys
import uuid
from pathlib import Path

# --- Bootstrap: alias the mismatched module tree (see module docstring). ---
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import importlib  # noqa: E402

_real_root = importlib.import_module("src.spechub_server")
sys.modules.setdefault("src.skillcanon_server", _real_root)

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

models = importlib.import_module("src.skillcanon_server.models")
prompt_service = importlib.import_module("src.skillcanon_server.services.prompt_service")
schemas = importlib.import_module("src.skillcanon_server.schemas")

Base = models.Base
Team = models.Team
User = models.User
Prompt = models.Prompt
PromptVersion = models.PromptVersion
Policy = models.Policy
Objective = models.Objective
EnforcementType = models.EnforcementType
ExpandRequest = schemas.ExpandRequest
expand_prompt = prompt_service.expand_prompt

OUTPUT_PATH = Path(__file__).resolve().parent / "expand_characterization_output.json"


async def _publish_skill(
    session: AsyncSession,
    name: str,
    *,
    system_template: str | None = None,
    user_template: str | None = None,
    owner_user_id: uuid.UUID | None = None,
    is_deprecated: bool = False,
    publish: bool = True,
) -> Prompt:
    prompt = Prompt(name=name, description=None, is_deprecated=is_deprecated, user_id=owner_user_id)
    session.add(prompt)
    await session.flush()

    if publish:
        version = PromptVersion(
            prompt_id=prompt.id,
            version="1.0.0",
            system_template=system_template,
            user_template=user_template,
            input_schema={},
            tags=[],
        )
        session.add(version)
        await session.flush()
        prompt.active_version_id = version.id

    await session.commit()
    return prompt


async def build_fixtures(session: AsyncSession) -> dict:
    """Creates every scenario's fixture data. Returns ids needed by scenarios."""
    team = Team(name="Root", slug=f"team-{uuid.uuid4()}", description=None)
    session.add(team)
    await session.flush()

    user = User(
        team_id=team.id,
        username=f"user-{uuid.uuid4()}",
        display_name="Fixture User",
        email=f"{uuid.uuid4()}@example.com",
        role="member",
        is_active=True,
    )
    session.add(user)
    await session.commit()

    # --- Scenario: basic substitution, both system and user templates. ---
    await _publish_skill(
        session,
        "basic-greet",
        system_template="You are a {{ tone }} assistant.",
        user_template="Say hello to {{ input }}.",
    )

    # --- Scenario: no system template. ---
    await _publish_skill(session, "system-less", system_template=None, user_template="Only user content: {{ input }}")

    # --- Scenario: nested inclusion, single level. ---
    await _publish_skill(
        session,
        "included-skill",
        system_template="You are a {{ tone }} assistant.",
        user_template="Say hello to {{ input }}.",
    )
    await _publish_skill(
        session,
        "includer-skill",
        user_template="Intro: {{ include_prompt('included-skill') }}\nEnd.",
    )

    # --- Scenario: chain nested exactly to MAX_INCLUDE_DEPTH (3). ---
    await _publish_skill(session, "chain-3", user_template="C3-content")
    await _publish_skill(session, "chain-2", user_template="C2[{{ include_prompt('chain-3') }}]")
    await _publish_skill(session, "chain-1", user_template="C1[{{ include_prompt('chain-2') }}]")
    await _publish_skill(session, "chain-0", user_template="C0[{{ include_prompt('chain-1') }}]")

    # --- Scenario: one level past the depth limit. ---
    await _publish_skill(session, "chain-4b", user_template="C4-content (should not appear)")
    await _publish_skill(session, "chain-3b", user_template="C3[{{ include_prompt('chain-4b') }}]")
    await _publish_skill(session, "chain-2b", user_template="C2[{{ include_prompt('chain-3b') }}]")
    await _publish_skill(session, "chain-1b", user_template="C1[{{ include_prompt('chain-2b') }}]")
    await _publish_skill(session, "chain-0b", user_template="C0[{{ include_prompt('chain-1b') }}]")

    # --- Scenario: reference to a nonexistent skill. ---
    await _publish_skill(
        session,
        "missing-ref-skill",
        user_template="Before. {{ include_prompt('does-not-exist') }} After.",
    )

    # --- Scenario: cyclic reference pair. ---
    await _publish_skill(session, "cycle-a", user_template="A[{{ include_prompt('cycle-b') }}]")
    await _publish_skill(session, "cycle-b", user_template="B[{{ include_prompt('cycle-a') }}]")

    # --- Scenario: fully governed — prepend + append + inject policies, plus a team objective. ---
    await _publish_skill(
        session,
        "governed-full",
        system_template="Base system.",
        user_template="Guidance: {{ policies }}\nGoals: {{ objectives }}\nTask: {{ input }}.",
    )
    session.add(
        Policy(
            team_id=team.id,
            name="safety-rules",
            enforcement_type=EnforcementType.prepend,
            content="Follow safety rules.",
            priority=10,
            is_active=True,
        )
    )
    session.add(
        Policy(
            team_id=team.id,
            name="cite-sources",
            enforcement_type=EnforcementType.append,
            content="Cite your sources.",
            priority=5,
            is_active=True,
        )
    )
    session.add(
        Policy(
            team_id=team.id,
            name="formal-tone",
            enforcement_type=EnforcementType.inject,
            content="Use a formal tone.",
            priority=0,
            is_active=True,
        )
    )
    session.add(Objective(team_id=team.id, title="Reduce latency", status="active"))
    await session.commit()

    # --- Scenario: deprecated skill rejection. ---
    await _publish_skill(
        session,
        "deprecated-skill",
        user_template="should not render",
        is_deprecated=True,
    )

    # --- Scenario: no published version yet. ---
    await _publish_skill(session, "never-published", publish=False)

    return {"user_id": user.id}


async def run_scenarios() -> dict:
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    results: dict[str, object] = {}

    async with session_factory() as session:
        ids = await build_fixtures(session)
        user_id = ids["user_id"]

        async def run(name: str, scenario_key: str, *, input: dict, version: str | None = None, user_id_arg=None):
            resp = await expand_prompt(
                session,
                name,
                ExpandRequest(input=input),
                version=version,
                user_id=user_id_arg,
            )
            if resp is None:
                results[scenario_key] = {"rejected": True}
            else:
                results[scenario_key] = {
                    "systemMessage": resp.system_message,
                    "userMessage": resp.user_message,
                    "appliedPolicies": resp.applied_policies,
                    "objectives": resp.objectives,
                }

        await run("basic-greet", "basic", input={"tone": "friendly", "input": "world"})
        await run("system-less", "systemLess", input={"input": "x"})
        await run("includer-skill", "nestedInclusion", input={"tone": "formal", "input": "Bob"})
        await run("chain-0", "depthAtLimit", input={})
        await run("chain-0b", "depthExceeded", input={})
        await run("missing-ref-skill", "missingRef", input={})
        await run("cycle-a", "cycle", input={})
        await run(
            "governed-full",
            "governedFull",
            input={"input": "draft the report"},
            user_id_arg=user_id,
        )
        await run("deprecated-skill", "deprecatedReject", input={})
        await run("never-published", "unpublishedReject", input={})

    await engine.dispose()
    return results


def main() -> None:
    results = asyncio.run(run_scenarios())
    OUTPUT_PATH.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {len(results)} scenario(s) to {OUTPUT_PATH}")
    for key, value in results.items():
        print(f"  - {key}: {'REJECTED' if value.get('rejected') else 'ok'}")


if __name__ == "__main__":
    main()
