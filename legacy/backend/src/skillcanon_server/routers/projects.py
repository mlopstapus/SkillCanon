import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.auth import get_current_user
from src.skillcanon_server.database import get_db
from src.skillcanon_server.models import User
from src.skillcanon_server.schemas import (
    ObjectiveCreate,
    ObjectiveResponse,
    ProjectCreate,
    ProjectListResponse,
    ProjectMemberAdd,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectUpdate,
)
from src.skillcanon_server.services import objective_service, project_service

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await project_service.create_project(db, data)
    except Exception:
        raise HTTPException(status_code=409, detail=f"Project slug '{data.slug}' already exists")


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    team_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await project_service.list_projects(db, team_id=team_id)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await project_service.get_project(db, project_id)
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await project_service.update_project(db, project_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await project_service.delete_project(db, project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")


# --- Project Members ---

@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=201,
)
async def add_project_member(
    project_id: uuid.UUID,
    data: ProjectMemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await project_service.add_member(db, project_id, data)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="User is already a project member")
        raise


@router.get(
    "/{project_id}/members",
    response_model=list[ProjectMemberResponse],
)
async def list_project_members(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await project_service.list_members(db, project_id)


@router.delete("/{project_id}/members/{user_id}", status_code=204)
async def remove_project_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    removed = await project_service.remove_member(db, project_id, user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Project member not found")


# --- Project Objectives ---

@router.get(
    "/{project_id}/objectives",
    response_model=list[ObjectiveResponse],
)
async def list_project_objectives(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await objective_service.list_project_objectives(db, project_id)


@router.post(
    "/{project_id}/objectives",
    response_model=ObjectiveResponse,
    status_code=201,
)
async def create_project_objective(
    project_id: uuid.UUID,
    data: ObjectiveCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data.project_id = project_id
    return await objective_service.create_objective(db, data)
