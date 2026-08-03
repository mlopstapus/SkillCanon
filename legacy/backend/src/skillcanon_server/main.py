import contextlib
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import src.skillcanon_server.mcp.tools as _mcp_tools  # noqa: F401 — registers @mcp.tool() decorators
from src.skillcanon_server.config import settings
from src.skillcanon_server.mcp.server import mcp
from src.skillcanon_server.mcp.session import ApiKeyMiddleware
from src.skillcanon_server.routers.apikeys import router as apikeys_router
from src.skillcanon_server.routers.auth import router as auth_router
from src.skillcanon_server.routers.metrics import router as metrics_router
from src.skillcanon_server.routers.objectives import router as objectives_router
from src.skillcanon_server.routers.policies import router as policies_router
from src.skillcanon_server.routers.projects import router as projects_router
from src.skillcanon_server.routers.prompts import router as prompts_router
from src.skillcanon_server.routers.teams import router as teams_router
from src.skillcanon_server.routers.users import router as users_router
from src.skillcanon_server.routers.workflows import router as workflows_router

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger("skillcanon")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SkillCanon server starting up")
    if settings.jwt_secret == "dev-jwt-secret-change-me-in-production":
        logger.warning(
            "JWT_SECRET is using the insecure default value. Set the JWT_SECRET "
            "environment variable before exposing this server beyond local dev — "
            "anyone with this public default can forge valid auth tokens."
        )
    async with mcp.session_manager.run():
        yield
    logger.info("SkillCanon server shutting down")


app = FastAPI(
    title="SkillCanon",
    description="An open-source, self-hosted prompt registry distributed via MCP",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(apikeys_router)
app.include_router(metrics_router)
app.include_router(objectives_router)
app.include_router(policies_router)
app.include_router(projects_router)
app.include_router(prompts_router)
app.include_router(teams_router)
app.include_router(users_router)
app.include_router(workflows_router)
app.mount("/mcp", ApiKeyMiddleware(mcp.streamable_http_app()))


@app.get("/health")
async def health():
    return {"status": "ok"}
