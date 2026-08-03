"""Auth dependencies for FastAPI: JWT + API key dual-mode authentication."""

import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.database import get_db
from src.skillcanon_server.models import User
from src.skillcanon_server.services import apikey_service, auth_service


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Extract the current user from the request.
    Supports two auth modes:
      1. JWT: Authorization: Bearer <jwt_token>
      2. API Key: Authorization: Bearer sh_<key>
    Returns the User or raises 401.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = auth_header[7:]  # strip "Bearer "

    # API key path (starts with sh_)
    if token.startswith("sh_"):
        api_key = await apikey_service.validate_key(db, token)
        if not api_key:
            raise HTTPException(status_code=401, detail="Invalid or expired API key")
        user = await auth_service.get_user_by_id(db, api_key.user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")
        return user

    # JWT path
    payload = auth_service.decode_jwt(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = uuid.UUID(payload["sub"])
    user = await auth_service.get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Same as get_current_user but returns None instead of raising 401."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency that requires the current user to be an admin."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
