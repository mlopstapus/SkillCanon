"""Invitation service: create, list, accept, revoke invitations."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.config import settings
from src.skillcanon_server.models import Invitation, User
from src.skillcanon_server.services.auth_service import hash_password


def _generate_token() -> str:
    return secrets.token_urlsafe(48)


async def create_invitation(
    db: AsyncSession,
    email: str,
    team_id: uuid.UUID,
    invited_by_id: uuid.UUID,
    role: str = "member",
) -> Invitation:
    """Create an invitation. Raises ValueError if email already has a pending invite."""
    # Check for existing pending invitation for this email
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Invitation).where(
            Invitation.email == email,
            Invitation.accepted_at == None,  # noqa: E711
        )
    )
    # Filter expiry in Python to avoid naive/aware datetime issues with SQLite
    existing = result.scalar_one_or_none()
    if existing:
        exp = (
            existing.expires_at
            if existing.expires_at.tzinfo
            else existing.expires_at.replace(tzinfo=timezone.utc)
        )
        if exp <= now:
            existing = None
    if existing:
        raise ValueError(f"Pending invitation already exists for {email}")

    # Check if email already registered
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise ValueError(f"User with email {email} already exists")

    invitation = Invitation(
        email=email,
        team_id=team_id,
        role=role,
        token=_generate_token(),
        invited_by_id=invited_by_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.invitation_expiry_hours),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    return invitation


async def list_invitations(db: AsyncSession) -> list[Invitation]:
    """List all invitations, newest first."""
    result = await db.execute(
        select(Invitation).order_by(Invitation.created_at.desc())
    )
    return list(result.scalars().all())


async def get_invitation_by_token(db: AsyncSession, token: str) -> Invitation | None:
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    return result.scalar_one_or_none()


async def accept_invitation(
    db: AsyncSession,
    token: str,
    username: str,
    password: str,
    display_name: str | None = None,
) -> tuple[User, str] | None:
    """
    Accept an invitation: create user, mark invitation as accepted.
    Returns (user, jwt_token) or None if token is invalid/expired.
    """
    from src.skillcanon_server.services.auth_service import create_jwt

    invitation = await get_invitation_by_token(db, token)
    if not invitation:
        return None
    if invitation.accepted_at is not None:
        return None
    exp = (
        invitation.expires_at
        if invitation.expires_at.tzinfo
        else invitation.expires_at.replace(tzinfo=timezone.utc)
    )
    if exp < datetime.now(timezone.utc):
        return None

    # Create user
    user = User(
        team_id=invitation.team_id,
        username=username,
        display_name=display_name or username,
        email=invitation.email,
        password_hash=hash_password(password),
        role=invitation.role,
    )
    db.add(user)

    # Mark invitation as accepted
    invitation.accepted_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(user)

    jwt_token = create_jwt(user.id, user.role)
    return user, jwt_token


async def revoke_invitation(db: AsyncSession, invitation_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(Invitation).where(Invitation.id == invitation_id)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        return False
    await db.delete(invitation)
    await db.commit()
    return True
