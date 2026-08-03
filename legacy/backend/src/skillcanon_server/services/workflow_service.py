import uuid
from collections import defaultdict

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.models import User, Workflow, WorkflowShare
from src.skillcanon_server.schemas import (
    ExpandRequest,
    ShareResponse,
    WorkflowCreate,
    WorkflowResponse,
    WorkflowRunResponse,
    WorkflowStep,
    WorkflowStepResult,
    WorkflowUpdate,
)
from src.skillcanon_server.services import prompt_service


async def create_workflow(db: AsyncSession, data: WorkflowCreate) -> WorkflowResponse:
    workflow = Workflow(
        user_id=data.user_id,
        project_id=data.project_id,
        name=data.name,
        description=data.description,
        steps=[s.model_dump() for s in data.steps],
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return WorkflowResponse.model_validate(workflow)


async def list_workflows(
    db: AsyncSession,
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
) -> list[WorkflowResponse]:
    query = select(Workflow)
    if user_id is not None:
        shared_ids = select(WorkflowShare.workflow_id).where(WorkflowShare.user_id == user_id)
        query = query.where(or_(Workflow.user_id == user_id, Workflow.id.in_(shared_ids)))
    if project_id is not None:
        query = query.where(Workflow.project_id == project_id)
    result = await db.execute(query.order_by(Workflow.updated_at.desc()))
    return [WorkflowResponse.model_validate(w) for w in result.scalars().all()]


async def get_workflow(db: AsyncSession, workflow_id: uuid.UUID) -> WorkflowResponse | None:
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        return None
    return WorkflowResponse.model_validate(workflow)


async def update_workflow(
    db: AsyncSession, workflow_id: uuid.UUID, data: WorkflowUpdate
) -> WorkflowResponse | None:
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        return None
    if data.name is not None:
        workflow.name = data.name
    if data.description is not None:
        workflow.description = data.description
    if data.steps is not None:
        workflow.steps = [s.model_dump() for s in data.steps]
    await db.commit()
    await db.refresh(workflow)
    return WorkflowResponse.model_validate(workflow)


async def delete_workflow(db: AsyncSession, workflow_id: uuid.UUID) -> bool:
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        return False
    await db.delete(workflow)
    await db.commit()
    return True


def _topological_sort(steps: list[WorkflowStep]) -> list[WorkflowStep]:
    """Sort steps in dependency order. Raises ValueError on cycles."""
    step_map = {s.id: s for s in steps}
    in_degree: dict[str, int] = defaultdict(int)
    dependents: dict[str, list[str]] = defaultdict(list)

    for s in steps:
        in_degree.setdefault(s.id, 0)
        for dep in s.depends_on:
            dependents[dep].append(s.id)
            in_degree[s.id] += 1

    queue = [sid for sid, deg in in_degree.items() if deg == 0]
    ordered: list[WorkflowStep] = []

    while queue:
        sid = queue.pop(0)
        ordered.append(step_map[sid])
        for dependent in dependents[sid]:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    if len(ordered) != len(steps):
        raise ValueError("Circular dependency detected in workflow steps")
    return ordered


async def run_workflow(
    db: AsyncSession, workflow_id: uuid.UUID, workflow_input: dict
) -> WorkflowRunResponse | None:
    wf = await get_workflow(db, workflow_id)
    if not wf:
        return None

    steps = [WorkflowStep(**s) if isinstance(s, dict) else s for s in wf.steps]
    ordered = _topological_sort(steps)

    step_outputs: dict[str, str] = {}
    step_results: list[WorkflowStepResult] = []

    # Build the input for each step: start with workflow_input, then layer in
    # the output of each dependency (keyed by step id).
    # Ensure "input" key always exists so {{ input }} never crashes.
    prev_output: str | None = None
    for step in ordered:
        step_input = dict(workflow_input)
        for dep_id in step.depends_on:
            if dep_id in step_outputs:
                step_input[dep_id] = step_outputs[dep_id]
        if prev_output is not None:
            step_input["input"] = prev_output
        step_input.setdefault("input", "")

        try:
            expand_result = await prompt_service.expand_prompt(
                db,
                step.prompt_name,
                ExpandRequest(input=step_input),
                version=step.prompt_version,
            )
            if not expand_result:
                step_results.append(
                    WorkflowStepResult(
                        step_id=step.id,
                        prompt_name=step.prompt_name,
                        prompt_version=step.prompt_version or "latest",
                        system_message=None,
                        user_message="",
                        status="error",
                        error=f"Prompt '{step.prompt_name}' not found",
                    )
                )
                break

            step_outputs[step.id] = expand_result.user_message
            prev_output = expand_result.user_message
            step_results.append(
                WorkflowStepResult(
                    step_id=step.id,
                    prompt_name=step.prompt_name,
                    prompt_version=expand_result.prompt_version,
                    system_message=expand_result.system_message,
                    user_message=expand_result.user_message,
                )
            )
        except Exception as e:
            step_results.append(
                WorkflowStepResult(
                    step_id=step.id,
                    prompt_name=step.prompt_name,
                    prompt_version=step.prompt_version or "latest",
                    system_message=None,
                    user_message="",
                    status="error",
                    error=str(e),
                )
            )
            break

    return WorkflowRunResponse(
        workflow_id=wf.id,
        workflow_name=wf.name,
        steps=step_results,
        outputs=step_outputs,
    )


async def share_workflow(
    db: AsyncSession, workflow_id: uuid.UUID, target_user_id: uuid.UUID
) -> ShareResponse | None:
    workflow = (
        await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    ).scalar_one_or_none()
    if not workflow:
        return None
    existing = (
        await db.execute(
            select(WorkflowShare).where(
                WorkflowShare.workflow_id == workflow_id, WorkflowShare.user_id == target_user_id
            )
        )
    ).scalar_one_or_none()
    if existing:
        user = (await db.execute(select(User).where(User.id == target_user_id))).scalar_one()
        return ShareResponse(
            id=existing.id,
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            created_at=existing.created_at,
        )
    share = WorkflowShare(workflow_id=workflow_id, user_id=target_user_id)
    db.add(share)
    await db.commit()
    await db.refresh(share)
    user = (await db.execute(select(User).where(User.id == target_user_id))).scalar_one()
    return ShareResponse(
        id=share.id,
        user_id=user.id,
        username=user.username,
        display_name=user.display_name,
        created_at=share.created_at,
    )


async def unshare_workflow(
    db: AsyncSession, workflow_id: uuid.UUID, target_user_id: uuid.UUID
) -> bool:
    share = (
        await db.execute(
            select(WorkflowShare).where(
                WorkflowShare.workflow_id == workflow_id, WorkflowShare.user_id == target_user_id
            )
        )
    ).scalar_one_or_none()
    if not share:
        return False
    await db.delete(share)
    await db.commit()
    return True


async def list_workflow_shares(
    db: AsyncSession, workflow_id: uuid.UUID
) -> list[ShareResponse] | None:
    workflow = (
        await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    ).scalar_one_or_none()
    if not workflow:
        return None
    result = await db.execute(
        select(WorkflowShare, User)
        .join(User, WorkflowShare.user_id == User.id)
        .where(WorkflowShare.workflow_id == workflow_id)
        .order_by(WorkflowShare.created_at)
    )
    return [
        ShareResponse(
            id=share.id,
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            created_at=share.created_at,
        )
        for share, user in result.all()
    ]
