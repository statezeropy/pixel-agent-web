"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import engine
from app.api.health import router as health_router
from app.api.layouts import router as layouts_router
from app.api.agents import router as agents_router
from app.api.websocket import router as ws_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: initialise and tear down shared resources."""
    # Startup -- engine is already created at import time; nothing extra needed
    yield
    # Shutdown -- dispose of the async engine connection pool
    await engine.dispose()


app = FastAPI(
    title="Pixel Agents",
    description="LangGraph-powered agent backend for Pixel Agents Web",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health_router)
app.include_router(layouts_router)
app.include_router(agents_router)
app.include_router(ws_router)
