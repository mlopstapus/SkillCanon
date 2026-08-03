import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.auth import get_current_user
from src.skillcanon_server.database import get_db
from src.skillcanon_server.models import Policy, Team, User
from src.skillcanon_server.schemas import (
    EffectivePoliciesResponse,
    PolicyCreate,
    PolicyResponse,
    PolicyUpdate,
)
from src.skillcanon_server.services import policy_service
from src.skillcanon_server.services.team_service import get_team_chain

router = APIRouter(prefix="/api/v1/policies", tags=["policies"])


async def _authorize_policy_team(
    db: AsyncSession, team_id: uuid.UUID, current_user: User
) -> None:
    """Allow admins, team owners, or parent team owners."""
    if current_user.role == "admin":
        return
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if team.owner_id == current_user.id:
        return
    if team.parent_team_id:
        parent = await db.execute(select(Team).where(Team.id == team.parent_team_id))
        parent_team = parent.scalar_one_or_none()
        if parent_team and parent_team.owner_id == current_user.id:
            return
    raise HTTPException(
        status_code=403,
        detail="Only admins, team owners, or parent team owners can manage policies",
    )


@router.post("", response_model=PolicyResponse, status_code=201)
async def create_policy(
    data: PolicyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _authorize_policy_team(db, data.team_id, current_user)
    return await policy_service.create_policy(db, data)


@router.get("/effective", response_model=EffectivePoliciesResponse)
async def get_effective_policies(
    user_id: uuid.UUID | None = Query(None),
    team_id: uuid.UUID | None = Query(None),
    project_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    if team_id:
        return await resolve_team_effective_policies(db, team_id)
    if user_id:
        return await policy_service.resolve_effective(db, user_id, project_id)
    raise HTTPException(status_code=400, detail="Provide user_id or team_id")


async def resolve_team_effective_policies(
    db: AsyncSession, team_id: uuid.UUID
) -> EffectivePoliciesResponse:
    chain = await get_team_chain(db, team_id)
    inherited: list[PolicyResponse] = []
    local: list[PolicyResponse] = []
    for i, team in enumerate(chain):
        result = await db.execute(
            select(Policy)
            .where(Policy.team_id == team.id, Policy.is_active.is_(True))
            .order_by(Policy.priority.desc())
        )
        for p in result.scalars().all():
            pr = PolicyResponse.model_validate(p)
            if i == 0:
                pr.is_inherited = False
                local.append(pr)
            else:
                pr.is_inherited = True
                inherited.append(pr)
    inherited.sort(key=lambda p: p.priority, reverse=True)
    local.sort(key=lambda p: p.priority, reverse=True)
    return EffectivePoliciesResponse(inherited=inherited, local=local)


@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(policy_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await policy_service.get_policy(db, policy_id)
    if not result:
        raise HTTPException(status_code=404, detail="Policy not found")
    return result


@router.put("/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: uuid.UUID,
    data: PolicyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = row.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    await _authorize_policy_team(db, policy.team_id, current_user)
    result = await policy_service.update_policy(db, policy_id, data)
    return result


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(
    policy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = row.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    await _authorize_policy_team(db, policy.team_id, current_user)
    await policy_service.delete_policy(db, policy_id)
