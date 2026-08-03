import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.models import Team
from src.skillcanon_server.schemas import (
    TeamCreate,
    TeamListResponse,
    TeamResponse,
    TeamUpdate,
)


async def create_team(db: AsyncSession, data: TeamCreate) -> TeamResponse:
    team = Team(
        name=data.name,
        slug=data.slug,
        description=data.description,
        parent_team_id=data.parent_team_id,
    )
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return TeamResponse.model_validate(team)


async def list_teams(
    db: AsyncSession, parent_team_id: uuid.UUID | None = None, flat: bool = False
) -> TeamListResponse:
    query = select(Team)
    count_query = select(func.count()).select_from(Team)

    if not flat:
        if parent_team_id is not None:
            query = query.where(Team.parent_team_id == parent_team_id)
            count_query = count_query.where(Team.parent_team_id == parent_team_id)
        else:
            query = query.where(Team.parent_team_id.is_(None))
            count_query = count_query.where(Team.parent_team_id.is_(None))

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    result = await db.execute(query.order_by(Team.name))
    teams = result.scalars().all()

    return TeamListResponse(
        items=[TeamResponse.model_validate(t) for t in teams],
        total=total,
    )


async def get_team(db: AsyncSession, team_id: uuid.UUID) -> TeamResponse | None:
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        return None
    return TeamResponse.model_validate(team)


async def update_team(
    db: AsyncSession, team_id: uuid.UUID, data: TeamUpdate
) -> TeamResponse | None:
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        return None

    if data.name is not None:
        team.name = data.name
    if data.description is not None:
        team.description = data.description
    if data.owner_id is not None:
        team.owner_id = data.owner_id

    await db.commit()
    await db.refresh(team)
    return TeamResponse.model_validate(team)


async def delete_team(db: AsyncSession, team_id: uuid.UUID) -> bool:
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        return False
    await db.delete(team)
    await db.commit()
    return True


async def insert_team_between(
    db: AsyncSession, data: TeamCreate, child_team_id: uuid.UUID
) -> TeamResponse:
    """Create a new team between parent and child.

    The new team gets the child's current parent_team_id.
    The child is reparented under the new team.
    """
    # Verify child exists
    result = await db.execute(select(Team).where(Team.id == child_team_id))
    child = result.scalar_one_or_none()
    if not child:
        raise ValueError("Child team not found")

    # New team takes the child's current parent
    new_team = Team(
        name=data.name,
        slug=data.slug,
        description=data.description,
        parent_team_id=child.parent_team_id,
    )
    db.add(new_team)
    await db.flush()  # get new_team.id

    # Reparent child under new team
    child.parent_team_id = new_team.id
    await db.commit()
    await db.refresh(new_team)
    return TeamResponse.model_validate(new_team)


async def get_team_chain(db: AsyncSession, team_id: uuid.UUID) -> list[Team]:
    """Walk the parent chain from team_id up to the root.

    Returns [current, parent, grandparent, ...].
    """
    chain: list[Team] = []
    current_id = team_id
    seen: set[uuid.UUID] = set()

    while current_id and current_id not in seen:
        seen.add(current_id)
        result = await db.execute(select(Team).where(Team.id == current_id))
        team = result.scalar_one_or_none()
        if not team:
            break
        chain.append(team)
        current_id = team.parent_team_id

    return chain
