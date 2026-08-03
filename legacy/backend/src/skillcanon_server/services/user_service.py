import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.models import User
from src.skillcanon_server.schemas import (
    UserCreate,
    UserListResponse,
    UserResponse,
    UserUpdate,
)


async def create_user(db: AsyncSession, data: UserCreate) -> UserResponse:
    user = User(
        team_id=data.team_id,
        username=data.username,
        display_name=data.display_name,
        email=data.email,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


async def list_users(
    db: AsyncSession, team_id: uuid.UUID | None = None
) -> UserListResponse:
    query = select(User)
    count_query = select(func.count()).select_from(User)

    if team_id is not None:
        query = query.where(User.team_id == team_id)
        count_query = count_query.where(User.team_id == team_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    result = await db.execute(query.order_by(User.username))
    users = result.scalars().all()

    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
    )


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> UserResponse | None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return None
    return UserResponse.model_validate(user)


async def get_user_model(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Return the raw ORM model (needed by other services for team_id access)."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def update_user(
    db: AsyncSession, user_id: uuid.UUID, data: UserUpdate
) -> UserResponse | None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return None

    if data.display_name is not None:
        user.display_name = data.display_name
    if data.email is not None:
        user.email = data.email
    if data.is_active is not None:
        user.is_active = data.is_active

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


async def delete_user(db: AsyncSession, user_id: uuid.UUID) -> bool:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return False
    await db.delete(user)
    await db.commit()
    return True
