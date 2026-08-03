import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.auth import get_current_user, require_admin
from src.skillcanon_server.database import get_db
from src.skillcanon_server.models import Team, User
from src.skillcanon_server.schemas import (
    TeamCreate,
    TeamListResponse,
    TeamResponse,
    TeamUpdate,
)
from src.skillcanon_server.services import team_service

router = APIRouter(prefix="/api/v1/teams", tags=["teams"])


@router.post("", response_model=TeamResponse, status_code=201)
async def create_team(
    data: TeamCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await team_service.create_team(db, data)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Team slug '{data.slug}' already exists")
        raise


@router.get("", response_model=TeamListResponse)
async def list_teams(
    parent_team_id: uuid.UUID | None = None,
    flat: bool = False,
    db: AsyncSession = Depends(get_db),
):
    return await team_service.list_teams(db, parent_team_id=parent_team_id, flat=flat)


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(team_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await team_service.get_team(db, team_id)
    if not result:
        raise HTTPException(status_code=404, detail="Team not found")
    return result


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: uuid.UUID,
    data: TeamUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select

    # Fetch the team
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Authorization: admin, team owner, or parent team owner
    is_admin = current_user.role == "admin"
    is_owner = team.owner_id == current_user.id
    is_parent_owner = False
    if team.parent_team_id:
        parent = await db.execute(select(Team).where(Team.id == team.parent_team_id))
        parent_team = parent.scalar_one_or_none()
        if parent_team and parent_team.owner_id == current_user.id:
            is_parent_owner = True

    if not (is_admin or is_owner or is_parent_owner):
        raise HTTPException(
            status_code=403,
            detail="Only admins, team owners, or parent team owners can update this team",
        )

    result = await team_service.update_team(db, team_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Team not found")
    return result


@router.post("/insert-between/{child_team_id}", response_model=TeamResponse, status_code=201)
async def insert_team_between(
    child_team_id: uuid.UUID,
    data: TeamCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new team between a child and its current parent.

    The child is reparented under the new team.
    """
    try:
        return await team_service.insert_team_between(db, data, child_team_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Team slug '{data.slug}' already exists")
        raise


@router.delete("/{team_id}", status_code=204)
async def delete_team(
    team_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    deleted = await team_service.delete_team(db, team_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Team not found")
