import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.models import Policy, User
from src.skillcanon_server.schemas import (
    EffectivePoliciesResponse,
    PolicyCreate,
    PolicyResponse,
    PolicyUpdate,
)
from src.skillcanon_server.services.team_service import get_team_chain


async def create_policy(db: AsyncSession, data: PolicyCreate) -> PolicyResponse:
    policy = Policy(
        team_id=data.team_id,
        project_id=data.project_id,
        name=data.name,
        description=data.description,
        enforcement_type=data.enforcement_type,
        content=data.content,
        priority=data.priority,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return PolicyResponse.model_validate(policy)


async def get_policy(db: AsyncSession, policy_id: uuid.UUID) -> PolicyResponse | None:
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        return None
    return PolicyResponse.model_validate(policy)


async def update_policy(
    db: AsyncSession, policy_id: uuid.UUID, data: PolicyUpdate
) -> PolicyResponse | None:
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        return None

    if data.name is not None:
        policy.name = data.name
    if data.description is not None:
        policy.description = data.description
    if data.enforcement_type is not None:
        policy.enforcement_type = data.enforcement_type
    if data.content is not None:
        policy.content = data.content
    if data.priority is not None:
        policy.priority = data.priority
    if data.is_active is not None:
        policy.is_active = data.is_active

    await db.commit()
    await db.refresh(policy)
    return PolicyResponse.model_validate(policy)


async def delete_policy(db: AsyncSession, policy_id: uuid.UUID) -> bool:
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        return False
    await db.delete(policy)
    await db.commit()
    return True


async def list_team_policies(
    db: AsyncSession, team_id: uuid.UUID
) -> list[PolicyResponse]:
    result = await db.execute(
        select(Policy)
        .where(Policy.team_id == team_id, Policy.is_active.is_(True))
        .order_by(Policy.priority.desc())
    )
    return [PolicyResponse.model_validate(p) for p in result.scalars().all()]


async def list_project_policies(
    db: AsyncSession, project_id: uuid.UUID
) -> list[PolicyResponse]:
    result = await db.execute(
        select(Policy)
        .where(Policy.project_id == project_id, Policy.is_active.is_(True))
        .order_by(Policy.priority.desc())
    )
    return [PolicyResponse.model_validate(p) for p in result.scalars().all()]


async def resolve_effective(
    db: AsyncSession, user_id: uuid.UUID, project_id: uuid.UUID | None = None
) -> EffectivePoliciesResponse:
    """Resolve the two-layer effective policies for a user.

    Inherited (immutable): all active policies from the user's team chain
    (parent teams), coalesced into one read-only set.
    Local (mutable): policies from the user's own team.
    If project_id is specified, project policies are added as an independent layer
    merged into the local set.
    """
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return EffectivePoliciesResponse(inherited=[], local=[])

    chain = await get_team_chain(db, user.team_id)
    # chain[0] = user's team, chain[1] = parent, chain[2] = grandparent, ...

    inherited: list[PolicyResponse] = []
    local: list[PolicyResponse] = []

    for i, team in enumerate(chain):
        result = await db.execute(
            select(Policy)
            .where(Policy.team_id == team.id, Policy.is_active.is_(True))
            .order_by(Policy.priority.desc())
        )
        policies = result.scalars().all()
        for p in policies:
            pr = PolicyResponse.model_validate(p)
            if i == 0:
                # User's own team = local (mutable)
                pr.is_inherited = False
                local.append(pr)
            else:
                # Parent teams = inherited (immutable)
                pr.is_inherited = True
                inherited.append(pr)

    # Project policies are independent — add to local layer
    if project_id:
        proj_result = await db.execute(
            select(Policy)
            .where(Policy.project_id == project_id, Policy.is_active.is_(True))
            .order_by(Policy.priority.desc())
        )
        for p in proj_result.scalars().all():
            pr = PolicyResponse.model_validate(p)
            pr.is_inherited = False
            local.append(pr)

    # Sort each layer by priority descending
    inherited.sort(key=lambda p: p.priority, reverse=True)
    local.sort(key=lambda p: p.priority, reverse=True)

    return EffectivePoliciesResponse(inherited=inherited, local=local)


async def resolve_all_policies(
    db: AsyncSession, user_id: uuid.UUID, project_id: uuid.UUID | None = None
) -> list[PolicyResponse]:
    """Return a single merged list of all effective policies, ordered by priority.
    Inherited policies win ties."""
    effective = await resolve_effective(db, user_id, project_id)
    all_policies = []
    for p in effective.inherited:
        all_policies.append(p)
    for p in effective.local:
        all_policies.append(p)
    # Sort: priority desc, inherited first at equal priority
    all_policies.sort(key=lambda p: (p.priority, p.is_inherited), reverse=True)
    return all_policies
