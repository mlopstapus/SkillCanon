import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.models import Objective, User
from src.skillcanon_server.schemas import (
    EffectiveObjectivesResponse,
    ObjectiveCreate,
    ObjectiveResponse,
    ObjectiveUpdate,
)
from src.skillcanon_server.services.team_service import get_team_chain


async def create_objective(db: AsyncSession, data: ObjectiveCreate) -> ObjectiveResponse:
    objective = Objective(
        team_id=data.team_id,
        project_id=data.project_id,
        user_id=data.user_id,
        title=data.title,
        description=data.description,
        parent_objective_id=data.parent_objective_id,
    )
    db.add(objective)
    await db.commit()
    await db.refresh(objective)
    return ObjectiveResponse.model_validate(objective)


async def get_objective(
    db: AsyncSession, objective_id: uuid.UUID
) -> ObjectiveResponse | None:
    result = await db.execute(select(Objective).where(Objective.id == objective_id))
    obj = result.scalar_one_or_none()
    if not obj:
        return None
    return ObjectiveResponse.model_validate(obj)


async def update_objective(
    db: AsyncSession, objective_id: uuid.UUID, data: ObjectiveUpdate
) -> ObjectiveResponse | None:
    result = await db.execute(select(Objective).where(Objective.id == objective_id))
    obj = result.scalar_one_or_none()
    if not obj:
        return None

    if data.title is not None:
        obj.title = data.title
    if data.description is not None:
        obj.description = data.description
    if data.status is not None:
        obj.status = data.status

    await db.commit()
    await db.refresh(obj)
    return ObjectiveResponse.model_validate(obj)


async def delete_objective(db: AsyncSession, objective_id: uuid.UUID) -> bool:
    result = await db.execute(select(Objective).where(Objective.id == objective_id))
    obj = result.scalar_one_or_none()
    if not obj:
        return False
    await db.delete(obj)
    await db.commit()
    return True


async def list_team_objectives(
    db: AsyncSession, team_id: uuid.UUID
) -> list[ObjectiveResponse]:
    result = await db.execute(
        select(Objective)
        .where(Objective.team_id == team_id, Objective.status == "active")
        .order_by(Objective.created_at)
    )
    return [ObjectiveResponse.model_validate(o) for o in result.scalars().all()]


async def list_user_objectives(
    db: AsyncSession, user_id: uuid.UUID
) -> list[ObjectiveResponse]:
    result = await db.execute(
        select(Objective)
        .where(Objective.user_id == user_id, Objective.status == "active")
        .order_by(Objective.created_at)
    )
    return [ObjectiveResponse.model_validate(o) for o in result.scalars().all()]


async def list_project_objectives(
    db: AsyncSession, project_id: uuid.UUID
) -> list[ObjectiveResponse]:
    result = await db.execute(
        select(Objective)
        .where(Objective.project_id == project_id, Objective.status == "active")
        .order_by(Objective.created_at)
    )
    return [ObjectiveResponse.model_validate(o) for o in result.scalars().all()]


async def resolve_effective(
    db: AsyncSession, user_id: uuid.UUID, project_id: uuid.UUID | None = None
) -> EffectiveObjectivesResponse:
    """Resolve the two-layer effective objectives for a user.

    Inherited (immutable): objectives from parent teams in the chain, accumulated.
    Local (mutable): objectives from the user's own team + user's personal objectives.
    If project_id is specified, project objectives are added to the local set.
    """
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return EffectiveObjectivesResponse(inherited=[], local=[])

    chain = await get_team_chain(db, user.team_id)

    inherited: list[ObjectiveResponse] = []
    local: list[ObjectiveResponse] = []

    for i, team in enumerate(chain):
        result = await db.execute(
            select(Objective)
            .where(Objective.team_id == team.id, Objective.status == "active")
            .order_by(Objective.created_at)
        )
        for o in result.scalars().all():
            obj_resp = ObjectiveResponse.model_validate(o)
            if i == 0:
                obj_resp.is_inherited = False
                local.append(obj_resp)
            else:
                obj_resp.is_inherited = True
                inherited.append(obj_resp)

    # User's personal objectives → local
    user_objs_result = await db.execute(
        select(Objective)
        .where(Objective.user_id == user_id, Objective.status == "active")
        .order_by(Objective.created_at)
    )
    for o in user_objs_result.scalars().all():
        obj_resp = ObjectiveResponse.model_validate(o)
        obj_resp.is_inherited = False
        local.append(obj_resp)

    # Project objectives → local (independent)
    if project_id:
        proj_result = await db.execute(
            select(Objective)
            .where(Objective.project_id == project_id, Objective.status == "active")
            .order_by(Objective.created_at)
        )
        for o in proj_result.scalars().all():
            obj_resp = ObjectiveResponse.model_validate(o)
            obj_resp.is_inherited = False
            local.append(obj_resp)

    return EffectiveObjectivesResponse(inherited=inherited, local=local)


async def resolve_all_objectives(
    db: AsyncSession, user_id: uuid.UUID, project_id: uuid.UUID | None = None
) -> list[str]:
    """Return a flat list of all effective objective titles for template injection."""
    effective = await resolve_effective(db, user_id, project_id)
    titles = [o.title for o in effective.inherited]
    titles.extend(o.title for o in effective.local)
    return titles
