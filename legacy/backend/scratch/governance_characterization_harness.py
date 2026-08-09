"""Characterization harness for the Governance resolution engine port
(005-governance/003-hierarchical-resolution-engine).

Runs the real legacy `resolve_effective`/`resolve_all_policies`
(`src/skillcanon_server/services/policy_service.py`) and
`resolve_effective`/`resolve_all_objectives`
(`src/skillcanon_server/services/objective_service.py`) directly against a
fixed set of fixture scenarios - no HTTP, no running server, just an
in-memory SQLite-backed AsyncSession exactly like `tests/conftest.py` uses.
Records each scenario's output as JSON to
`governance_characterization_output.json` (in this same directory) so the
TypeScript side
(`src/bcs/governance/application/resolve-characterization.test.ts`) can
assert its own `resolveEffectivePolicies`/`resolveAllPolicies`/
`resolveEffectiveObjectives`/`resolveAllObjectives` produce identical output
for the same fixture data, without needing Python/`uv` available at
`vitest` run time.

Run via (per CLAUDE.md's legacy-test convention):

    cd legacy/backend && uv run python scratch/governance_characterization_harness.py

Scope note (PDR-016)
--------------------------------------------------------------------------
Legacy `resolve_effective`/`resolve_all_policies` for *policies* accept an
optional `project_id` that adds an independent project-scoped policy layer.
Per PDR-016, the new TypeScript `Policy` model dropped project scope
entirely - policy is purely team + invoking-user scoped now. The policy
scenarios below therefore never pass `project_id`, matching what the TS
side can actually be asked to do; this is an intentional, accepted
divergence (documented in `005-governance/003-hierarchical-resolution-
engine.md`'s own Requirements), not something silently dropped here.
`Objective` kept its `project_id` scope unchanged, so the objective
scenarios do exercise it.

Keeping fixtures in sync with the TypeScript side
--------------------------------------------------------------------------
Fixtures are hand-mirrored (not read from a shared file) against
`src/bcs/governance/application/resolve-characterization.test.ts` - the two
engines' underlying schemas differ enough (legacy has no
`organizationId`; ids/teams/users must be constructed differently on each
side) that only the literal content - team names, policy/objective names,
priorities, enforcement types, and content - actually needs to match, not
the fixture-setup plumbing. Each scenario below is named and each literal
value is called out in a comment; the TypeScript characterization test
names its own scenarios identically and reuses the exact same literal
values. If you change a literal value on one side, change it on the other.
"""

import asyncio
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402
from src.skillcanon_server import models  # noqa: E402
from src.skillcanon_server.services import objective_service, policy_service  # noqa: E402

Base = models.Base
Team = models.Team
User = models.User
Policy = models.Policy
Objective = models.Objective
EnforcementType = models.EnforcementType

OUTPUT_PATH = Path(__file__).resolve().parent / "governance_characterization_output.json"

BASE_TIME = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _ts(offset_seconds: int) -> datetime:
    return BASE_TIME + timedelta(seconds=offset_seconds)


async def _make_team(session: AsyncSession, name: str, *, parent_team_id: uuid.UUID | None = None) -> Team:
    team = Team(name=name, slug=f"{name}-{uuid.uuid4()}", parent_team_id=parent_team_id)
    session.add(team)
    await session.commit()
    return team


async def _make_user(session: AsyncSession, team_id: uuid.UUID, *, display_name: str = "Fixture User") -> User:
    user = User(
        team_id=team_id,
        username=f"user-{uuid.uuid4()}",
        display_name=display_name,
        email=f"{uuid.uuid4()}@example.com",
        role="member",
        is_active=True,
    )
    session.add(user)
    await session.commit()
    return user


def _policy_dict(p) -> dict:
    return {
        "name": p.name,
        "enforcementType": p.enforcement_type.value if hasattr(p.enforcement_type, "value") else p.enforcement_type,
        "content": p.content,
        "priority": p.priority,
        "isInherited": p.is_inherited,
    }


def _effective_policies_dict(effective) -> dict:
    return {
        "inherited": [_policy_dict(p) for p in effective.inherited],
        "local": [_policy_dict(p) for p in effective.local],
    }


def _objective_dict(o) -> dict:
    return {"title": o.title, "isInherited": o.is_inherited}


def _effective_objectives_dict(effective) -> dict:
    return {
        "inherited": [_objective_dict(o) for o in effective.inherited],
        "local": [_objective_dict(o) for o in effective.local],
    }


async def run_policy_scenarios(session: AsyncSession, results: dict) -> None:
    # --- policyBasicLocal: single team, 3 active policies at distinct
    # priorities plus 1 inactive policy that must be excluded entirely. ---
    team = await _make_team(session, "policy-basic-team")
    user = await _make_user(session, team.id)
    session.add_all(
        [
            Policy(team_id=team.id, name="policy-mid", enforcement_type=EnforcementType.prepend, content="Mid content.", priority=10, is_active=True),
            Policy(team_id=team.id, name="policy-low", enforcement_type=EnforcementType.append, content="Low content.", priority=5, is_active=True),
            Policy(team_id=team.id, name="policy-high", enforcement_type=EnforcementType.inject, content="High content.", priority=20, is_active=True),
            Policy(team_id=team.id, name="policy-inactive", enforcement_type=EnforcementType.prepend, content="Should not appear.", priority=999, is_active=False),
        ]
    )
    await session.commit()
    effective = await policy_service.resolve_effective(session, user.id)
    results["policyBasicLocal"] = _effective_policies_dict(effective)

    # --- policyInheritedChain: 3-level chain (root -> mid -> leaf), each
    # level owns exactly one policy at a distinct priority. Own team
    # (leaf) = local; root/mid = inherited. ---
    root = await _make_team(session, "policy-chain-root")
    mid = await _make_team(session, "policy-chain-mid", parent_team_id=root.id)
    leaf = await _make_team(session, "policy-chain-leaf", parent_team_id=mid.id)
    leaf_user = await _make_user(session, leaf.id)
    session.add_all(
        [
            Policy(team_id=root.id, name="root-policy", enforcement_type=EnforcementType.prepend, content="Root content.", priority=1, is_active=True),
            Policy(team_id=mid.id, name="mid-policy", enforcement_type=EnforcementType.append, content="Mid content.", priority=2, is_active=True),
            Policy(team_id=leaf.id, name="leaf-policy", enforcement_type=EnforcementType.inject, content="Leaf content.", priority=3, is_active=True),
        ]
    )
    await session.commit()
    effective = await policy_service.resolve_effective(session, leaf_user.id)
    results["policyInheritedChain"] = _effective_policies_dict(effective)

    # --- policyTieBreak: an inherited (parent) policy and a local (own
    # team) policy share the same priority (10) - inherited must win the
    # tie in resolve_all_policies' flat ordering. ---
    parent = await _make_team(session, "policy-tie-parent")
    child = await _make_team(session, "policy-tie-child", parent_team_id=parent.id)
    child_user = await _make_user(session, child.id)
    session.add_all(
        [
            Policy(team_id=parent.id, name="inherited-tie", enforcement_type=EnforcementType.prepend, content="Inherited tie content.", priority=10, is_active=True),
            Policy(team_id=child.id, name="local-tie", enforcement_type=EnforcementType.append, content="Local tie content.", priority=10, is_active=True),
        ]
    )
    await session.commit()
    all_policies = await policy_service.resolve_all_policies(session, child_user.id)
    results["policyTieBreak_all"] = [_policy_dict(p) for p in all_policies]


async def run_objective_scenarios(session: AsyncSession, results: dict) -> None:
    # --- objectiveInheritedChain: 3-level chain, one team-scoped
    # objective per level, sequential timestamps for deterministic
    # ordering. Own team (leaf) = local; root/mid = inherited. ---
    root = await _make_team(session, "objective-chain-root")
    mid = await _make_team(session, "objective-chain-mid", parent_team_id=root.id)
    leaf = await _make_team(session, "objective-chain-leaf", parent_team_id=mid.id)
    leaf_user = await _make_user(session, leaf.id)
    session.add_all(
        [
            Objective(team_id=root.id, title="root-objective", created_at=_ts(0)),
            Objective(team_id=mid.id, title="mid-objective", created_at=_ts(1)),
            Objective(team_id=leaf.id, title="leaf-objective", created_at=_ts(2)),
        ]
    )
    await session.commit()
    effective = await objective_service.resolve_effective(session, leaf_user.id)
    results["objectiveInheritedChain"] = _effective_objectives_dict(effective)

    # --- objectiveUserPersonal: own team's objective plus the user's own
    # personal (user-scoped) objective - both land in `local`, team-scoped
    # first (created first), matching insertion order. ---
    team = await _make_team(session, "objective-personal-team")
    user = await _make_user(session, team.id)
    session.add_all(
        [
            Objective(team_id=team.id, title="team-objective", created_at=_ts(10)),
            Objective(user_id=user.id, title="personal-objective", created_at=_ts(11)),
        ]
    )
    await session.commit()
    effective = await objective_service.resolve_effective(session, user.id)
    results["objectiveUserPersonal"] = _effective_objectives_dict(effective)

    # --- objectiveProjectScoped: a project objective only appears when
    # project_id is passed; absent otherwise. Same team/user, two calls. ---
    team2 = await _make_team(session, "objective-project-team")
    user2 = await _make_user(session, team2.id)
    project_id = uuid.uuid4()
    session.add(Objective(project_id=project_id, title="project-objective", created_at=_ts(20)))
    await session.commit()
    without_project = await objective_service.resolve_effective(session, user2.id)
    with_project = await objective_service.resolve_effective(session, user2.id, project_id=project_id)
    results["objectiveProjectScoped_without"] = _effective_objectives_dict(without_project)
    results["objectiveProjectScoped_with"] = _effective_objectives_dict(with_project)

    # --- objectiveCombined: chain (inherited + local team objective) +
    # personal + project, all at once - verifies resolve_all_objectives'
    # flat ordering: every inherited title (in inherited-list order), then
    # every local title (in local-list order: team, then personal, then
    # project). ---
    croot = await _make_team(session, "objective-combined-root")
    cleaf = await _make_team(session, "objective-combined-leaf", parent_team_id=croot.id)
    cuser = await _make_user(session, cleaf.id)
    cproject_id = uuid.uuid4()
    session.add_all(
        [
            Objective(team_id=croot.id, title="combined-root-objective", created_at=_ts(30)),
            Objective(team_id=cleaf.id, title="combined-leaf-objective", created_at=_ts(31)),
            Objective(user_id=cuser.id, title="combined-personal-objective", created_at=_ts(32)),
            Objective(project_id=cproject_id, title="combined-project-objective", created_at=_ts(33)),
        ]
    )
    await session.commit()
    all_titles = await objective_service.resolve_all_objectives(session, cuser.id, project_id=cproject_id)
    results["objectiveCombined_all"] = all_titles


async def run_scenarios() -> dict:
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    results: dict[str, object] = {}

    async with session_factory() as session:
        await run_policy_scenarios(session, results)
        await run_objective_scenarios(session, results)

    await engine.dispose()
    return results


def main() -> None:
    results = asyncio.run(run_scenarios())
    OUTPUT_PATH.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {len(results)} scenario(s) to {OUTPUT_PATH}")
    for key in results:
        print(f"  - {key}")


if __name__ == "__main__":
    main()
