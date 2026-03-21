import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mcp.server.sse import SseServerTransport
from mcp.types import TextContent

from grexis.lib.config import get_settings
from grexis import deps
from grexis.mcp.server import server as mcp_server
from grexis.mcp.query_solutions import handle_query_solutions
from grexis.mcp.submit_problem import handle_submit_problem
from grexis.mcp.submit_solution import handle_submit_solution
from grexis.mcp.submit_feedback import handle_submit_feedback
from grexis.mcp.register_agent import handle_register_agent
from grexis.admin.routes import router as admin_router, auth_router
from grexis.scheduler.jobs import register_jobs, scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # Connect to data stores
    await deps.postgres.connect(settings.POSTGRES_URL)
    await deps.qdrant.connect(settings.QDRANT_URL)
    await deps.redis.connect(settings.REDIS_URL)

    # Initialize embedding service FIRST (needed for vector_size)
    await deps.embed_service.initialize(
        provider=settings.EMBEDDING_PROVIDER,
        openai_key=settings.OPENAI_API_KEY,
    )

    # Ensure Qdrant collections exist with correct vector dimensions
    await deps.qdrant.ensure_collections(deps.embed_service.vector_size)

    # Start scheduler
    register_jobs()
    scheduler.start()

    logger.info("GREXIS API started")
    yield

    # Shutdown
    scheduler.shutdown()
    await deps.postgres.close()
    await deps.qdrant.close()
    await deps.redis.close()
    logger.info("GREXIS API stopped")


app = FastAPI(title="GREXIS", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.3.0"}


@app.get("/ready")
async def ready():
    try:
        await deps.postgres.fetchval("SELECT 1")
        await deps.redis.client.ping()
        # Qdrant health is checked via collection list
        await deps.qdrant.client.get_collections()
        return {"status": "ready"}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={"status": "not ready", "error": str(e)})


# --- MCP Tool Dispatch ---

TOOL_HANDLERS = {
    "query_solutions": handle_query_solutions,
    "submit_problem": handle_submit_problem,
    "submit_solution": handle_submit_solution,
    "submit_feedback": handle_submit_feedback,
    "register_agent": handle_register_agent,
}


@mcp_server.call_tool()
async def call_tool(name: str, arguments: dict):
    from grexis.services.tokens import BannedTokenError
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        raise ValueError(f"Unknown tool: {name}")
    try:
        result = await handler(deps=deps, **arguments)
    except BannedTokenError as e:
        result = {"error": "TOKEN_BANNED", "message": str(e)}
    return [TextContent(type="text", text=json.dumps(result))]


# Mount MCP SSE transport as a raw ASGI sub-app.
# FastAPI's mount("/mcp", app) sets root_path="/mcp" and strips "/mcp" from path.
# SseServerTransport("/messages") builds POST URL as root_path + "/messages" = "/mcp/messages".
# We use a raw ASGI app to avoid Starlette Route/Mount wrappers that would either
# conflict with SSE's own response handling or modify root_path incorrectly.

sse = SseServerTransport("/messages")


async def _mcp_app(scope, receive, send):
    """Raw ASGI router for MCP endpoints."""
    if scope["type"] == "lifespan":
        return
    # FastAPI mount sets root_path but does NOT strip it from path.
    # Strip the mount prefix to get the sub-path for routing.
    root = scope.get("root_path", "")
    path = scope.get("path", "")
    sub_path = path[len(root):] if path.startswith(root) else path
    if sub_path in ("/sse", "/sse/"):
        async with sse.connect_sse(scope, receive, send) as streams:
            await mcp_server.run(
                streams[0], streams[1], mcp_server.create_initialization_options()
            )
    elif sub_path.startswith("/messages"):
        await sse.handle_post_message(scope, receive, send)
    else:
        await send({"type": "http.response.start", "status": 404, "headers": []})
        await send({"type": "http.response.body", "body": b"Not found"})


app.mount("/mcp", _mcp_app)

# --- Admin Routes ---
app.include_router(auth_router)
app.include_router(admin_router)
