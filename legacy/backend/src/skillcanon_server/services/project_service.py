import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.models import Project, ProjectMember
from src.skillcanon_server.schemas import (
    ProjectCreate,
    ProjectListResponse,
    ProjectMemberAdd,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectUpdate,
)


async def create_project(db: AsyncSession, data: ProjectCreate) -> ProjectResponse:
    project = Project(
        team_id=data.team_id,
        lead_user_id=data.lead_user_id,
        name=data.name,
        slug=data.slug,
        description=data.description,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


async def list_projects(
    db: AsyncSession, team_id: uuid.UUID | None = None
) -> ProjectListResponse:
    query = select(Project)
    count_query = select(func.count()).select_from(Project)

    if team_id is not None:
        query = query.where(Project.team_id == team_id)
        count_query = count_query.where(Project.team_id == team_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    result = await db.execute(query.order_by(Project.name))
    projects = result.scalars().all()

    return ProjectListResponse(
        items=[ProjectResponse.model_validate(p) for p in projects],
        total=total,
    )


async def get_project(db: AsyncSession, project_id: uuid.UUID) -> ProjectResponse | None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        return None
    return ProjectResponse.model_validate(project)


async def update_project(
    db: AsyncSession, project_id: uuid.UUID, data: ProjectUpdate
) -> ProjectResponse | None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        return None

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.lead_user_id is not None:
        project.lead_user_id = data.lead_user_id

    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


async def delete_project(db: AsyncSession, project_id: uuid.UUID) -> bool:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        return False
    await db.delete(project)
    await db.commit()
    return True


# --- Project Members ---

async def add_member(
    db: AsyncSession, project_id: uuid.UUID, data: ProjectMemberAdd
) -> ProjectMemberResponse:
    member = ProjectMember(
        project_id=project_id,
        user_id=data.user_id,
        role=data.role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return ProjectMemberResponse.model_validate(member)


async def list_members(
    db: AsyncSession, project_id: uuid.UUID
) -> list[ProjectMemberResponse]:
    result = await db.execute(
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.created_at)
    )
    return [ProjectMemberResponse.model_validate(m) for m in result.scalars().all()]


async def remove_member(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        return False
    await db.delete(member)
    await db.commit()
    return True
