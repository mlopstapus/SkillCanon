import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.auth import get_current_user
from src.skillcanon_server.database import get_db
from src.skillcanon_server.models import User
from src.skillcanon_server.schemas import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyResponse,
)
from src.skillcanon_server.services import apikey_service

router = APIRouter(tags=["api-keys"])


def _require_self_or_admin(current_user: User, user_id: uuid.UUID) -> None:
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized for this user's API keys")


@router.post(
    "/api/v1/users/{user_id}/api-keys",
    response_model=ApiKeyCreatedResponse,
    status_code=201,
)
async def create_api_key(
    user_id: uuid.UUID,
    data: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_self_or_admin(current_user, user_id)
    key, raw_key = await apikey_service.create_api_key(
        db,
        user_id=user_id,
        name=data.name,
        scopes=data.scopes,
        expires_at=data.expires_at,
    )
    return ApiKeyCreatedResponse(
        key=ApiKeyResponse.model_validate(key),
        raw_key=raw_key,
    )


@router.get(
    "/api/v1/users/{user_id}/api-keys",
    response_model=list[ApiKeyResponse],
)
async def list_api_keys(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_self_or_admin(current_user, user_id)
    keys = await apikey_service.list_api_keys(db, user_id)
    return [ApiKeyResponse.model_validate(k) for k in keys]


@router.delete("/api/v1/api-keys/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key = await apikey_service.get_api_key(db, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    _require_self_or_admin(current_user, key.user_id)
    revoked = await apikey_service.revoke_api_key(db, key_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="API key not found")
