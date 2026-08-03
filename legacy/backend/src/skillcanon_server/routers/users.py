import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.auth import get_current_user, require_admin
from src.skillcanon_server.database import get_db
from src.skillcanon_server.models import User as UserModel
from src.skillcanon_server.schemas import (
    UserCreate,
    UserListResponse,
    UserResponse,
    UserUpdate,
)
from src.skillcanon_server.services import user_service

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    data: UserCreate,
    admin: UserModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await user_service.create_user(db, data)
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(
                status_code=409, detail=f"Username '{data.username}' already exists"
            )
        raise


@router.get("", response_model=UserListResponse)
async def list_users(
    team_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await user_service.list_users(db, team_id=team_id)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await user_service.get_user(db, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await user_service.update_user(db, user_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    admin: UserModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    deleted = await user_service.delete_user(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
