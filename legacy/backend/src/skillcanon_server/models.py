import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class EnforcementType(str, enum.Enum):
    prepend = "prepend"
    append = "append"
    inject = "inject"
    validate = "validate"


# ---------------------------------------------------------------------------
# Team (recursive hierarchy)
# ---------------------------------------------------------------------------

class Team(Base):
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", use_alter=True), nullable=True, index=True
    )
    parent_team_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("teams.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped["User | None"] = relationship(
        foreign_keys=[owner_id], back_populates="owned_teams"
    )
    parent_team: Mapped["Team | None"] = relationship(
        remote_side="Team.id", back_populates="sub_teams"
    )
    sub_teams: Mapped[list["Team"]] = relationship(back_populates="parent_team")
    members: Mapped[list["User"]] = relationship(
        foreign_keys="[User.team_id]", back_populates="team"
    )
    policies: Mapped[list["Policy"]] = relationship(back_populates="team")
    objectives: Mapped[list["Objective"]] = relationship(
        foreign_keys="[Objective.team_id]", back_populates="team"
    )
    projects: Mapped[list["Project"]] = relationship(back_populates="team")


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id"), nullable=False, index=True
    )
    username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    team: Mapped["Team"] = relationship(foreign_keys=[team_id], back_populates="members")
    owned_teams: Mapped[list["Team"]] = relationship(
        foreign_keys="[Team.owner_id]", back_populates="owner"
    )
    prompts: Mapped[list["Prompt"]] = relationship(back_populates="user")
    workflows: Mapped[list["Workflow"]] = relationship(back_populates="user")
    api_keys: Mapped[list["ApiKey"]] = relationship(back_populates="user")
    objectives: Mapped[list["Objective"]] = relationship(
        foreign_keys="[Objective.user_id]", back_populates="user"
    )
    project_memberships: Mapped[list["ProjectMember"]] = relationship(back_populates="user")
    sent_invitations: Mapped[list["Invitation"]] = relationship(back_populates="invited_by_user")
    prompt_shares: Mapped[list["PromptShare"]] = relationship(back_populates="user")
    workflow_shares: Mapped[list["WorkflowShare"]] = relationship(back_populates="user")


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------

class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("teams.id"), nullable=True, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("projects.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    enforcement_type: Mapped[EnforcementType] = mapped_column(
        Enum(EnforcementType), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    team: Mapped["Team | None"] = relationship(back_populates="policies")
    project: Mapped["Project | None"] = relationship(back_populates="policies")


# ---------------------------------------------------------------------------
# Objective
# ---------------------------------------------------------------------------

class Objective(Base):
    __tablename__ = "objectives"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("teams.id"), nullable=True, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("projects.id"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    parent_objective_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("objectives.id"), nullable=True, index=True
    )
    is_inherited: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    team: Mapped["Team | None"] = relationship(
        foreign_keys=[team_id], back_populates="objectives"
    )
    project: Mapped["Project | None"] = relationship(back_populates="objectives")
    user: Mapped["User | None"] = relationship(
        foreign_keys=[user_id], back_populates="objectives"
    )
    parent_objective: Mapped["Objective | None"] = relationship(
        remote_side="Objective.id", back_populates="child_objectives"
    )
    child_objectives: Mapped[list["Objective"]] = relationship(
        back_populates="parent_objective"
    )


# ---------------------------------------------------------------------------
# Project (owned by a team, has a lead, cross-team members)
# ---------------------------------------------------------------------------

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id"), nullable=False, index=True
    )
    lead_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    team: Mapped["Team"] = relationship(back_populates="projects")
    lead: Mapped["User | None"] = relationship(foreign_keys=[lead_user_id])
    members: Mapped[list["ProjectMember"]] = relationship(back_populates="project")
    policies: Mapped[list["Policy"]] = relationship(back_populates="project")
    objectives: Mapped[list["Objective"]] = relationship(back_populates="project")
    workflows: Mapped[list["Workflow"]] = relationship(back_populates="project")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("projects.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(50), default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="project_memberships")


# ---------------------------------------------------------------------------
# Prompt (user-scoped)
# ---------------------------------------------------------------------------

class Prompt(Base):
    __tablename__ = "prompts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_deprecated: Mapped[bool] = mapped_column(Boolean, default=False)
    active_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("prompt_versions.id", use_alter=True), nullable=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User | None"] = relationship(back_populates="prompts")
    versions: Mapped[list["PromptVersion"]] = relationship(
        back_populates="prompt",
        order_by="PromptVersion.created_at.desc()",
        foreign_keys="[PromptVersion.prompt_id]",
    )
    shares: Mapped[list["PromptShare"]] = relationship(
        back_populates="prompt", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# ApiKey (user-scoped)
# ---------------------------------------------------------------------------

class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    scopes: Mapped[list] = mapped_column(JSON, default=list)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="api_keys")


# ---------------------------------------------------------------------------
# PromptVersion (unchanged)
# ---------------------------------------------------------------------------

class PromptVersion(Base):
    __tablename__ = "prompt_versions"
    __table_args__ = (UniqueConstraint("prompt_id", "version"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prompts.id"), nullable=False, index=True
    )
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    system_template: Mapped[str | None] = mapped_column(Text)
    user_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_schema: Mapped[dict] = mapped_column(JSON, default=dict)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    prompt: Mapped["Prompt"] = relationship(
        back_populates="versions", foreign_keys="[PromptVersion.prompt_id]"
    )


# ---------------------------------------------------------------------------
# Workflow (user-scoped, optionally project-associated)
# ---------------------------------------------------------------------------

class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("projects.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="workflows")
    project: Mapped["Project | None"] = relationship(back_populates="workflows")
    shares: Mapped[list["WorkflowShare"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# PromptShare (sharing prompts between users)
# ---------------------------------------------------------------------------

class PromptShare(Base):
    __tablename__ = "prompt_shares"
    __table_args__ = (UniqueConstraint("prompt_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prompts.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    prompt: Mapped["Prompt"] = relationship(back_populates="shares")
    user: Mapped["User"] = relationship(back_populates="prompt_shares")


# ---------------------------------------------------------------------------
# WorkflowShare (sharing workflows between users)
# ---------------------------------------------------------------------------

class WorkflowShare(Base):
    __tablename__ = "workflow_shares"
    __table_args__ = (UniqueConstraint("workflow_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workflows.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    workflow: Mapped["Workflow"] = relationship(back_populates="shares")
    user: Mapped["User"] = relationship(back_populates="workflow_shares")


# ---------------------------------------------------------------------------
# Invitation
# ---------------------------------------------------------------------------

class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(50), default="member")
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    invited_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    team: Mapped["Team"] = relationship()
    invited_by_user: Mapped["User"] = relationship(
        foreign_keys=[invited_by_id], back_populates="sent_invitations"
    )


# ---------------------------------------------------------------------------
# PromptUsage (unchanged)
# ---------------------------------------------------------------------------

class PromptUsage(Base):
    __tablename__ = "prompt_usage"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    prompt_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
