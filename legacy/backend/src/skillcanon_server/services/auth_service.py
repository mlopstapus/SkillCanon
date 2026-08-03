"""Authentication service: password hashing, JWT creation/validation."""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.config import settings
from src.skillcanon_server.models import Team, User

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_jwt(user_id: uuid.UUID, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_jwt(token: str) -> dict | None:
    """Decode a JWT token. Returns payload dict or None if invalid."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def has_any_user(db: AsyncSession) -> bool:
    """Check if any user exists in the system (for first-time registration)."""
    result = await db.execute(select(func.count(User.id)))
    return result.scalar_one() > 0


async def register_admin(
    db: AsyncSession,
    org_name: str,
    org_slug: str,
    email: str,
    username: str,
    password: str,
    display_name: str | None = None,
) -> tuple[User, Team, str]:
    """
    Register the first admin user + create the root org team.
    Returns (user, team, jwt_token).
    Raises ValueError if users already exist.
    """
    if await has_any_user(db):
        raise ValueError("Organization already exists. Use an invitation to join.")

    # Create root team (org)
    team = Team(name=org_name, slug=org_slug)
    db.add(team)
    await db.flush()

    # Create admin user
    user = User(
        team_id=team.id,
        username=username,
        display_name=display_name or username,
        email=email,
        password_hash=hash_password(password),
        role="admin",
    )
    db.add(user)
    await db.flush()

    # Set team owner
    team.owner_id = user.id
    await db.commit()
    await db.refresh(user)
    await db.refresh(team)

    token = create_jwt(user.id, user.role)
    return user, team, token


async def login(
    db: AsyncSession,
    email: str,
    password: str,
) -> tuple[User, str] | None:
    """
    Authenticate by email + password.
    Returns (user, jwt_token) or None if invalid.
    """
    result = await db.execute(
        select(User).where(User.email == email, User.is_active == True)  # noqa: E712
    )
    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    token = create_jwt(user.id, user.role)
    return user, token


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
