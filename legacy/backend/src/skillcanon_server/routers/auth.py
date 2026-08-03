"""Auth router: register, login, me, invitations."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.auth import get_current_user, require_admin
from src.skillcanon_server.database import get_db
from src.skillcanon_server.models import User
from src.skillcanon_server.services import auth_service, invitation_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    org_name: str
    org_slug: str
    email: str
    username: str
    password: str
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


class MeResponse(BaseModel):
    id: str
    username: str
    display_name: str | None
    email: str | None
    role: str
    team_id: str
    is_active: bool


class InviteRequest(BaseModel):
    email: str
    team_id: str
    role: str = "member"


class InvitationResponse(BaseModel):
    id: str
    email: str
    team_id: str
    role: str
    token: str
    invited_by_id: str
    accepted_at: str | None
    expires_at: str
    created_at: str


class AcceptInviteRequest(BaseModel):
    username: str
    password: str
    display_name: str | None = None


class OrgStatusResponse(BaseModel):
    has_org: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status", response_model=OrgStatusResponse)
async def org_status(db: AsyncSession = Depends(get_db)):
    """Check if an organization has been set up (any users exist)."""
    has = await auth_service.has_any_user(db)
    return OrgStatusResponse(has_org=has)


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register the first admin user and create the organization. Only works once."""
    try:
        user, team, token = await auth_service.register_admin(
            db,
            org_name=data.org_name,
            org_slug=data.org_slug,
            email=data.email,
            username=data.username,
            password=data.password,
            display_name=data.display_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Username or email already taken")
        raise

    return AuthResponse(
        token=token,
        user={
            "id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "role": user.role,
            "team_id": str(user.team_id),
        },
    )


@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with email + password, returns JWT."""
    result = await auth_service.login(db, data.email, data.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user, token = result
    return AuthResponse(
        token=token,
        user={
            "id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "role": user.role,
            "team_id": str(user.team_id),
        },
    )


@router.get("/me", response_model=MeResponse)
async def me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user."""
    return MeResponse(
        id=str(current_user.id),
        username=current_user.username,
        display_name=current_user.display_name,
        email=current_user.email,
        role=current_user.role,
        team_id=str(current_user.team_id),
        is_active=current_user.is_active,
    )


# ---------------------------------------------------------------------------
# Invitations (admin only)
# ---------------------------------------------------------------------------

@router.post("/invitations", response_model=InvitationResponse, status_code=201)
async def create_invitation(
    data: InviteRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create an invitation (admin only)."""
    import uuid as _uuid

    try:
        inv = await invitation_service.create_invitation(
            db,
            email=data.email,
            team_id=_uuid.UUID(data.team_id),
            invited_by_id=admin.id,
            role=data.role,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return _inv_response(inv)


@router.get("/invitations", response_model=list[InvitationResponse])
async def list_invitations(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all invitations (admin only)."""
    invitations = await invitation_service.list_invitations(db)
    return [_inv_response(inv) for inv in invitations]


@router.delete("/invitations/{invitation_id}", status_code=204)
async def revoke_invitation(
    invitation_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an invitation (admin only)."""
    import uuid as _uuid

    success = await invitation_service.revoke_invitation(db, _uuid.UUID(invitation_id))
    if not success:
        raise HTTPException(status_code=404, detail="Invitation not found")


@router.get("/invitations/token/{token}")
async def get_invitation_info(token: str, db: AsyncSession = Depends(get_db)):
    """Get invitation info by token (public, for the accept page)."""
    inv = await invitation_service.get_invitation_by_token(db, token)
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if inv.accepted_at is not None:
        raise HTTPException(status_code=410, detail="Invitation already accepted")
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    expires = (
        inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
    )
    if expires < now:
        raise HTTPException(status_code=410, detail="Invitation expired")
    return {
        "email": inv.email,
        "team_id": str(inv.team_id),
        "role": inv.role,
    }


@router.post("/invitations/{token}/accept", response_model=AuthResponse, status_code=201)
async def accept_invitation(
    token: str,
    data: AcceptInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Accept an invitation: create account and join the org."""
    try:
        result = await invitation_service.accept_invitation(
            db,
            token=token,
            username=data.username,
            password=data.password,
            display_name=data.display_name,
        )
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Username or email already taken")
        raise

    if not result:
        raise HTTPException(status_code=400, detail="Invalid, expired, or already-used invitation")

    user, jwt_token = result
    return AuthResponse(
        token=jwt_token,
        user={
            "id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "role": user.role,
            "team_id": str(user.team_id),
        },
    )


def _inv_response(inv) -> InvitationResponse:
    return InvitationResponse(
        id=str(inv.id),
        email=inv.email,
        team_id=str(inv.team_id),
        role=inv.role,
        token=inv.token,
        invited_by_id=str(inv.invited_by_id),
        accepted_at=inv.accepted_at.isoformat() if inv.accepted_at else None,
        expires_at=inv.expires_at.isoformat(),
        created_at=inv.created_at.isoformat(),
    )
