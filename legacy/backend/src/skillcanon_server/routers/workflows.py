import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.auth import get_current_user
from src.skillcanon_server.database import get_db
from src.skillcanon_server.models import User
from src.skillcanon_server.schemas import (
    ShareRequest,
    ShareResponse,
    WorkflowCreate,
    WorkflowResponse,
    WorkflowRunRequest,
    WorkflowRunResponse,
    WorkflowUpdate,
)
from src.skillcanon_server.services import workflow_service

router = APIRouter(prefix="/api/v1", tags=["workflows"])


@router.post("/workflows", response_model=WorkflowResponse, status_code=201)
async def create_workflow(
    data: WorkflowCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data.user_id = current_user.id
    return await workflow_service.create_workflow(db, data)


@router.get("/workflows", response_model=list[WorkflowResponse])
async def list_workflows(
    user_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await workflow_service.list_workflows(db, user_id=user_id, project_id=project_id)


@router.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await workflow_service.get_workflow(db, workflow_id)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result


@router.put("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: uuid.UUID, data: WorkflowUpdate, db: AsyncSession = Depends(get_db)
):
    result = await workflow_service.update_workflow(db, workflow_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result


@router.delete("/workflows/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    deleted = await workflow_service.delete_workflow(db, workflow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")


@router.post("/workflows/{workflow_id}/run", response_model=WorkflowRunResponse)
async def run_workflow(
    workflow_id: uuid.UUID, data: WorkflowRunRequest, db: AsyncSession = Depends(get_db)
):
    try:
        result = await workflow_service.run_workflow(db, workflow_id, data.input)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result


@router.post("/workflows/{workflow_id}/shares", response_model=ShareResponse, status_code=201)
async def share_workflow(
    workflow_id: uuid.UUID, data: ShareRequest, db: AsyncSession = Depends(get_db)
):
    result = await workflow_service.share_workflow(db, workflow_id, data.user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result


@router.get("/workflows/{workflow_id}/shares", response_model=list[ShareResponse])
async def list_workflow_shares(workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await workflow_service.list_workflow_shares(db, workflow_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return result


@router.delete("/workflows/{workflow_id}/shares/{user_id}", status_code=204)
async def unshare_workflow(
    workflow_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    success = await workflow_service.unshare_workflow(db, workflow_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Share not found")
