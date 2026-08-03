import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.auth import get_current_user
from src.skillcanon_server.database import get_db
from src.skillcanon_server.models import User
from src.skillcanon_server.schemas import (
    EffectiveObjectivesResponse,
    ObjectiveCreate,
    ObjectiveResponse,
    ObjectiveUpdate,
)
from src.skillcanon_server.services import objective_service
from src.skillcanon_server.services.team_service import get_team_chain

router = APIRouter(prefix="/api/v1/objectives", tags=["objectives"])


@router.post("", response_model=ObjectiveResponse, status_code=201)
async def create_objective(
    data: ObjectiveCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await objective_service.create_objective(db, data)


@router.get("/effective", response_model=EffectiveObjectivesResponse)
async def get_effective_objectives(
    user_id: uuid.UUID | None = Query(None),
    team_id: uuid.UUID | None = Query(None),
    project_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    if team_id:
        return await resolve_team_effective_objectives(db, team_id)
    if user_id:
        return await objective_service.resolve_effective(db, user_id, project_id)
    raise HTTPException(status_code=400, detail="Provide user_id or team_id")


async def resolve_team_effective_objectives(
    db: AsyncSession, team_id: uuid.UUID
) -> EffectiveObjectivesResponse:
    from sqlalchemy import select

    from src.skillcanon_server.models import Objective
    chain = await get_team_chain(db, team_id)
    inherited: list[ObjectiveResponse] = []
    local: list[ObjectiveResponse] = []

    # Local: this team's own objectives (chain[0])
    result = await db.execute(
        select(Objective)
        .where(Objective.team_id == chain[0].id, Objective.status == "active")
        .order_by(Objective.created_at)
    )
    for o in result.scalars().all():
        obj_resp = ObjectiveResponse.model_validate(o)
        obj_resp.is_inherited = False
        local.append(obj_resp)

    # Inherited: only from the direct parent (chain[1]), no full rollup
    if len(chain) > 1:
        result = await db.execute(
            select(Objective)
            .where(Objective.team_id == chain[1].id, Objective.status == "active")
            .order_by(Objective.created_at)
        )
        for o in result.scalars().all():
            obj_resp = ObjectiveResponse.model_validate(o)
            obj_resp.is_inherited = True
            inherited.append(obj_resp)

    return EffectiveObjectivesResponse(inherited=inherited, local=local)


@router.get("/{objective_id}", response_model=ObjectiveResponse)
async def get_objective(objective_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await objective_service.get_objective(db, objective_id)
    if not result:
        raise HTTPException(status_code=404, detail="Objective not found")
    return result


@router.put("/{objective_id}", response_model=ObjectiveResponse)
async def update_objective(
    objective_id: uuid.UUID,
    data: ObjectiveUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await objective_service.update_objective(db, objective_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Objective not found")
    return result


@router.delete("/{objective_id}", status_code=204)
async def delete_objective(
    objective_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await objective_service.delete_objective(db, objective_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Objective not found")
