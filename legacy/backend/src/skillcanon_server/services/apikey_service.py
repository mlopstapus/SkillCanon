import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.models import ApiKey


def _generate_raw_key() -> str:
    return "sh_" + secrets.token_urlsafe(32)


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def create_api_key(
    db: AsyncSession,
    user_id: uuid.UUID,
    name: str,
    scopes: list[str] | None = None,
    expires_at: datetime | None = None,
) -> tuple[ApiKey, str]:
    """Create an API key. Returns (model, raw_key). Raw key is shown once."""
    raw_key = _generate_raw_key()
    key = ApiKey(
        user_id=user_id,
        name=name,
        key_hash=_hash_key(raw_key),
        prefix=raw_key[:12],
        scopes=scopes or ["read", "expand"],
        expires_at=expires_at,
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    return key, raw_key


async def list_api_keys(
    db: AsyncSession, user_id: uuid.UUID
) -> list[ApiKey]:
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == user_id)
        .order_by(ApiKey.created_at.desc())
    )
    return list(result.scalars().all())


async def get_api_key(db: AsyncSession, key_id: uuid.UUID) -> ApiKey | None:
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    return result.scalar_one_or_none()


async def revoke_api_key(db: AsyncSession, key_id: uuid.UUID) -> bool:
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        return False
    key.is_active = False
    await db.commit()
    return True


async def validate_key(db: AsyncSession, raw_key: str) -> ApiKey | None:
    """Validate a raw API key. Returns the ApiKey if valid, None otherwise."""
    key_hash = _hash_key(raw_key)
    result = await db.execute(
        select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)  # noqa: E712
    )
    key = result.scalar_one_or_none()
    if not key:
        return None
    if key.expires_at and key.expires_at < datetime.now(timezone.utc):
        return None
    key.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    return key
