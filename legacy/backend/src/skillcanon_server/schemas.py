import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class EnforcementTypeEnum(str, Enum):
    prepend = "prepend"
    append = "append"
    inject = "inject"
    validate = "validate"


# ---------------------------------------------------------------------------
# Team schemas
# ---------------------------------------------------------------------------

class TeamCreate(BaseModel):
    name: str = Field(..., examples=["MLOps"])
    slug: str = Field(..., pattern=r"^[a-z0-9-]+$", examples=["mlops"])
    description: str | None = None
    parent_team_id: uuid.UUID | None = None


class TeamUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    owner_id: uuid.UUID | None = None


class TeamResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    owner_id: uuid.UUID | None
    parent_team_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TeamListResponse(BaseModel):
    items: list[TeamResponse]
    total: int


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    username: str = Field(..., pattern=r"^[a-z0-9_-]+$", examples=["alice"])
    display_name: str | None = None
    email: str | None = None
    team_id: uuid.UUID


class UserUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    username: str
    display_name: str | None
    email: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int


# ---------------------------------------------------------------------------
# Policy schemas
# ---------------------------------------------------------------------------

class PolicyCreate(BaseModel):
    team_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    name: str = Field(..., examples=["require-tests"])
    description: str | None = None
    enforcement_type: EnforcementTypeEnum
    content: str = Field(..., examples=["All code must include tests."])
    priority: int = Field(default=0)


class PolicyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enforcement_type: EnforcementTypeEnum | None = None
    content: str | None = None
    priority: int | None = None
    is_active: bool | None = None


class PolicyResponse(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID | None
    project_id: uuid.UUID | None
    name: str
    description: str | None
    enforcement_type: EnforcementTypeEnum
    content: str
    priority: int
    is_active: bool
    created_at: datetime
    is_inherited: bool = False

    model_config = {"from_attributes": True}


class EffectivePoliciesResponse(BaseModel):
    inherited: list[PolicyResponse]
    local: list[PolicyResponse]


# ---------------------------------------------------------------------------
# Objective schemas
# ---------------------------------------------------------------------------

class ObjectiveCreate(BaseModel):
    team_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    title: str = Field(..., examples=["Improve platform reliability"])
    description: str | None = None
    parent_objective_id: uuid.UUID | None = None


class ObjectiveUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None


class ObjectiveResponse(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID | None
    project_id: uuid.UUID | None
    user_id: uuid.UUID | None
    title: str
    description: str | None
    parent_objective_id: uuid.UUID | None
    is_inherited: bool
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EffectiveObjectivesResponse(BaseModel):
    inherited: list[ObjectiveResponse]
    local: list[ObjectiveResponse]


# ---------------------------------------------------------------------------
# Project schemas (team-owned, with lead and cross-team members)
# ---------------------------------------------------------------------------

class ProjectCreate(BaseModel):
    team_id: uuid.UUID
    lead_user_id: uuid.UUID | None = None
    name: str = Field(..., examples=["Model Registry v2"])
    slug: str = Field(..., pattern=r"^[a-z0-9-]+$", examples=["model-registry-v2"])
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    lead_user_id: uuid.UUID | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    lead_user_id: uuid.UUID | None
    name: str
    slug: str
    description: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    items: list[ProjectResponse]
    total: int


class ProjectMemberAdd(BaseModel):
    user_id: uuid.UUID
    role: str = Field(default="member", examples=["member", "contributor"])


class ProjectMemberResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Prompt schemas (user-scoped)
# ---------------------------------------------------------------------------

_DEFAULT_INPUT_SCHEMA: dict = {
    "type": "object",
    "properties": {"input": {"type": "string", "description": "Free-text input"}},
    "required": ["input"],
}


class PromptVersionCreate(BaseModel):
    version: str = Field(..., examples=["1.0.0"])
    system_template: str | None = None
    user_template: str | None = Field(
        default=None,
        examples=["Generate a PRD for: {{ feature_description }}"],
    )
    input_schema: dict = Field(default_factory=lambda: dict(_DEFAULT_INPUT_SCHEMA))
    tags: list[str] = Field(default_factory=list)


class PromptCreate(BaseModel):
    name: str = Field(..., pattern=r"^[a-z0-9-]+$", examples=["feature-prd"])
    description: str | None = None
    version: PromptVersionCreate
    user_id: uuid.UUID | None = None


class PromptVersionResponse(BaseModel):
    id: uuid.UUID
    prompt_id: uuid.UUID
    version: str
    system_template: str | None
    user_template: str | None
    input_schema: dict
    tags: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class PromptResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    is_deprecated: bool
    user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    latest_version: PromptVersionResponse | None = None

    model_config = {"from_attributes": True}


class PromptListResponse(BaseModel):
    items: list[PromptResponse]
    total: int
    page: int
    page_size: int


class NewVersionCreate(BaseModel):
    version: str = Field(..., examples=["1.1.0"])
    system_template: str | None = None
    user_template: str | None = None
    input_schema: dict = Field(default_factory=lambda: dict(_DEFAULT_INPUT_SCHEMA))
    tags: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Expand schemas (with optional project context)
# ---------------------------------------------------------------------------

class ExpandRequest(BaseModel):
    input: dict = Field(default_factory=dict)
    project_id: uuid.UUID | None = None


class ExpandResponse(BaseModel):
    prompt_name: str
    prompt_version: str
    system_message: str | None
    user_message: str
    applied_policies: list[str] = Field(default_factory=list)
    objectives: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# API Key schemas (user-scoped)
# ---------------------------------------------------------------------------

class ApiKeyCreate(BaseModel):
    name: str = Field(..., examples=["production"])
    scopes: list[str] = Field(default_factory=lambda: ["read", "expand"])
    expires_at: datetime | None = None


class ApiKeyResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    prefix: str
    scopes: list[str]
    expires_at: datetime | None
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None

    model_config = {"from_attributes": True}


class ApiKeyCreatedResponse(BaseModel):
    key: ApiKeyResponse
    raw_key: str = Field(..., description="Shown once. Store it securely.")


# ---------------------------------------------------------------------------
# Workflow schemas (user-scoped, optionally project-associated)
# ---------------------------------------------------------------------------

class WorkflowStep(BaseModel):
    id: str = Field(..., examples=["step-1"])
    prompt_name: str = Field(..., examples=["feature-prd"])
    prompt_version: str | None = None
    depends_on: list[str] = Field(default_factory=list)


class WorkflowCreate(BaseModel):
    user_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    name: str = Field(..., examples=["PRD Pipeline"])
    description: str | None = None
    steps: list[WorkflowStep] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    steps: list[WorkflowStep] | None = None


class WorkflowResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    project_id: uuid.UUID | None
    name: str
    description: str | None
    steps: list[WorkflowStep]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkflowRunRequest(BaseModel):
    input: dict = Field(default_factory=dict)


class WorkflowStepResult(BaseModel):
    step_id: str
    prompt_name: str
    prompt_version: str
    system_message: str | None
    user_message: str
    status: str = "success"
    error: str | None = None


class WorkflowRunResponse(BaseModel):
    workflow_id: uuid.UUID
    workflow_name: str
    steps: list[WorkflowStepResult]
    outputs: dict


# ---------------------------------------------------------------------------
# Sharing schemas
# ---------------------------------------------------------------------------

class ShareRequest(BaseModel):
    user_id: uuid.UUID


class ShareResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    display_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
